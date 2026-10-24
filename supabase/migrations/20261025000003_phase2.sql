-- Phase 2: dependencies, recurring tasks, custom fields, bugs, time tracking, templates.
-- Cross-table checks live in security definer helpers so policies never recurse.

insert into public.permission_catalog (key, module, label, description, scope, client_safe, sort) values
  ('template.manage',   'Projects', 'Manage templates',     'Save projects as templates and delete them',    'org',     false, 26),
  ('bug.create',        'Bugs',     'Report bugs',          'Clients can report bugs on their projects',     'project', true,  70),
  ('bug.edit',          'Bugs',     'Edit any bug',         null,                                            'project', false, 71),
  ('bug.assign',        'Bugs',     'Assign bugs',          null,                                            'project', false, 72),
  ('bug.verify',        'Bugs',     'Verify and close bugs','Move fixed bugs to verified or closed',         'project', false, 73),
  ('bug.delete',        'Bugs',     'Delete bugs',          null,                                            'project', false, 74),
  ('time.log',          'Time',     'Log time',             'Track time on tasks and bugs',                  'project', false, 80),
  ('time.view_all',     'Time',     'See everyone''s time', null,                                            'project', false, 81),
  ('timesheet.approve', 'Time',     'Approve timesheets',   'Approve or reject submitted time',              'project', false, 82)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Task dependencies: task_id cannot start until depends_on_id is done.
-- ---------------------------------------------------------------------------
create table public.task_dependencies (
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_id uuid not null references public.tasks (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create index task_dependencies_project_idx on public.task_dependencies (project_id);

create or replace function public.guard_task_dependency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id, project_id into new.org_id, new.project_id from public.tasks where id = new.task_id;
  if not exists (select 1 from public.tasks where id = new.depends_on_id and project_id = new.project_id) then
    raise exception 'Dependencies must be in the same project';
  end if;
  -- Reject cycles: depends_on_id must not (transitively) depend on task_id.
  if exists (
    with recursive chain(id) as (
      select d.depends_on_id from public.task_dependencies d where d.task_id = new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'That would create a dependency loop';
  end if;
  return new;
end;
$$;

create trigger task_dependencies_guard before insert on public.task_dependencies
  for each row execute function public.guard_task_dependency();

alter table public.task_dependencies enable row level security;
create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (public.can_view_task(task_id) and public.can_view_task(depends_on_id));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (public.can_edit_task(task_id));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (public.can_edit_task(task_id));

-- ---------------------------------------------------------------------------
-- Recurring tasks: completing one creates the next occurrence once.
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column recurrence text check (recurrence in ('daily', 'weekly', 'biweekly', 'monthly')),
  add column next_task_id uuid references public.tasks (id) on delete set null;

create or replace function public.spawn_recurring_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _step interval;
  _base date;
  _shift interval;
  _new uuid;
begin
  if new.recurrence is null or new.next_task_id is not null
     or new.completed_at is null or old.completed_at is not null then
    return null;
  end if;
  _step := case new.recurrence
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    else interval '1 month' end;
  _base := coalesce(new.due_date, current_date);
  _shift := (_base + _step)::timestamp - _base::timestamp;

  insert into public.tasks (project_id, list_id, milestone_id, parent_id, title, description, priority,
    start_date, due_date, estimate_hours, client_visible, position, created_by, recurrence)
  values (new.project_id, new.list_id, null, new.parent_id, new.title, new.description, new.priority,
    (new.start_date + _shift)::date, (_base + _step)::date, new.estimate_hours, new.client_visible,
    new.position, new.created_by, new.recurrence)
  returning id into _new;

  insert into public.task_assignees (task_id, user_id, org_id, project_id)
  select _new, a.user_id, a.org_id, a.project_id from public.task_assignees a where a.task_id = new.id
  on conflict do nothing;

  update public.tasks set next_task_id = _new where id = new.id;
  return null;
end;
$$;

-- Plain "after update": completed_at is set by a BEFORE trigger, which an
-- "update of completed_at" trigger would not see.
create trigger tasks_recur after update on public.tasks
  for each row execute function public.spawn_recurring_task();

-- ---------------------------------------------------------------------------
-- Custom fields (staff only; clients never see them)
-- ---------------------------------------------------------------------------
create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  field_type text not null check (field_type in ('text', 'number', 'date', 'select', 'checkbox')),
  options text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create trigger custom_fields_org before insert or update on public.custom_fields
  for each row execute function public.set_org_from_project();

create table public.task_field_values (
  task_id uuid not null references public.tasks (id) on delete cascade,
  field_id uuid not null references public.custom_fields (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  value text,
  primary key (task_id, field_id)
);

create or replace function public.guard_field_value()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _f public.custom_fields;
begin
  select org_id, project_id into new.org_id, new.project_id from public.tasks where id = new.task_id;
  select * into _f from public.custom_fields where id = new.field_id;
  if _f.project_id is distinct from new.project_id then
    raise exception 'Field belongs to another project';
  end if;
  new.value := nullif(trim(new.value), '');
  if new.value is not null then
    if _f.field_type = 'number' and new.value !~ '^-?\d+(\.\d+)?$' then
      raise exception '% must be a number', _f.name;
    elsif _f.field_type = 'date' and new.value !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception '% must be a date', _f.name;
    elsif _f.field_type = 'select' and not (new.value = any (_f.options)) then
      raise exception '% must be one of its options', _f.name;
    elsif _f.field_type = 'checkbox' and new.value not in ('true', 'false') then
      raise exception '% must be true or false', _f.name;
    end if;
  end if;
  return new;
end;
$$;

create trigger task_field_values_guard before insert or update on public.task_field_values
  for each row execute function public.guard_field_value();

alter table public.custom_fields enable row level security;
alter table public.task_field_values enable row level security;

create policy custom_fields_select on public.custom_fields for select to authenticated
  using (public.can_view_project(project_id) and public.is_org_staff(org_id));
create policy custom_fields_write on public.custom_fields for all to authenticated
  using (public.has_project_perm(project_id, 'project.edit'))
  with check (public.has_project_perm(project_id, 'project.edit'));

create policy task_field_values_select on public.task_field_values for select to authenticated
  using (public.can_view_task(task_id) and public.is_org_staff(org_id));
create policy task_field_values_write on public.task_field_values for all to authenticated
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));

-- ---------------------------------------------------------------------------
-- Bugs
-- ---------------------------------------------------------------------------
alter table public.projects add column bug_seq int not null default 0;

create or replace function public.prepare_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.key := upper(new.key);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.owner_id := coalesce(new.owner_id, new.created_by);
    new.task_seq := 0;
    new.bug_seq := 0;
  else
    new.org_id := old.org_id;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.task_seq := greatest(new.task_seq, old.task_seq);
    new.bug_seq := greatest(new.bug_seq, old.bug_seq);
  end if;
  return new;
end;
$$;

create table public.bugs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number int not null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  steps text,
  environment text,
  severity text not null default 'major' check (severity in ('minor', 'major', 'critical', 'blocker')),
  reproducibility text not null default 'always' check (reproducibility in ('always', 'sometimes', 'rarely', 'unable')),
  status text not null default 'new'
    check (status in ('new', 'open', 'in_progress', 'fixed', 'verified', 'closed', 'reopened')),
  reporter_id uuid references public.profiles (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  milestone_id uuid references public.milestones (id) on delete set null,
  client_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fixed_at timestamptz,
  closed_at timestamptz,
  unique (project_id, number)
);

create index bugs_project_idx on public.bugs (project_id, status);
create index bugs_assignee_idx on public.bugs (assignee_id) where closed_at is null;

create or replace function public.prepare_bug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.projects set bug_seq = bug_seq + 1 where id = new.project_id returning bug_seq into new.number;
    new.reporter_id := coalesce(auth.uid(), new.reporter_id);
    new.status := 'new';
    if public.is_org_client(new.org_id) then
      new.client_visible := true;
      new.assignee_id := null;
    end if;
  else
    new.number := old.number;
    new.reporter_id := old.reporter_id;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.status is distinct from old.status and auth.uid() is not null then
      if (new.status in ('verified', 'closed') or old.status in ('verified', 'closed'))
         and not public.has_project_perm(new.project_id, 'bug.verify') then
        raise exception 'Only people who can verify bugs can verify, close or reopen them';
      end if;
    end if;
  end if;

  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if not exists (
      select 1 from public.project_members pm
      join public.org_members m on m.org_id = pm.org_id and m.user_id = pm.user_id and m.status = 'active'
      join public.roles r on r.id = m.role_id
      where pm.project_id = new.project_id and pm.user_id = new.assignee_id and r.system_key is distinct from 'client'
    ) then
      raise exception 'Assignees must be team members of the project';
    end if;
  end if;
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'Linked task belongs to another project';
  end if;

  new.fixed_at := case when new.status in ('fixed', 'verified', 'closed') then coalesce(new.fixed_at, now()) else null end;
  new.closed_at := case when new.status = 'closed' then coalesce(new.closed_at, now()) else null end;
  return new;
end;
$$;

create trigger bugs_org before insert or update on public.bugs
  for each row execute function public.set_org_from_project();
create trigger bugs_prepare before insert or update on public.bugs
  for each row execute function public.prepare_bug();

create or replace function public.can_view_bug(_bug uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bugs b
    where b.id = _bug and public.can_view_project(b.project_id)
      and (b.client_visible or not public.is_org_client(b.org_id))
  );
$$;

create or replace function public.can_edit_bug(_bug uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bugs b
    where b.id = _bug and not public.is_org_client(b.org_id)
      and (
        public.has_project_perm(b.project_id, 'bug.edit')
        or public.has_project_perm(b.project_id, 'bug.verify')
        or (public.can_view_project(b.project_id) and auth.uid() in (b.assignee_id, b.reporter_id))
      )
  );
$$;

alter table public.bugs enable row level security;
create policy bugs_select on public.bugs for select to authenticated using (public.can_view_bug(id));
create policy bugs_insert on public.bugs for insert to authenticated with check (public.has_project_perm(project_id, 'bug.create'));
create policy bugs_update on public.bugs for update to authenticated
  using (public.can_edit_bug(id)) with check (public.can_view_project(project_id));
create policy bugs_delete on public.bugs for delete to authenticated using (public.has_project_perm(project_id, 'bug.delete'));

create or replace function public.bug_ref(_bug uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.key || '-B' || b.number || ' ' || b.title
  from public.bugs b join public.projects p on p.id = b.project_id
  where b.id = _bug and (auth.uid() is null or public.can_view_bug(b.id));
$$;

revoke execute on function public.bug_ref(uuid) from public, anon;
grant execute on function public.bug_ref(uuid) to authenticated;

create or replace function public.on_bug_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _ref text := public.bug_ref(new.id);
  _link text := '/go/bug/' || new.id;
  _user uuid;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.org_id, new.project_id, 'reported', 'bug', new.id, 'reported ' || _ref, new.client_visible);
    if new.assignee_id is not null then
      perform public.notify(new.assignee_id, new.org_id, 'bug.assigned', 'Bug assigned to you: ' || _ref, null, _link);
    end if;
    return null;
  end if;
  if new.status is distinct from old.status then
    perform public.log_activity(new.org_id, new.project_id, 'bug_status', 'bug', new.id,
      'marked ' || _ref || ' as ' || replace(new.status, '_', ' '), new.client_visible);
    for _user in select x from unnest(array[new.reporter_id, new.assignee_id]) x where x is not null loop
      perform public.notify(_user, new.org_id, 'bug.status', _ref, 'Now ' || replace(new.status, '_', ' '), _link);
    end loop;
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    perform public.notify(new.assignee_id, new.org_id, 'bug.assigned', 'Bug assigned to you: ' || _ref, null, _link);
  end if;
  return null;
end;
$$;

create trigger bugs_activity after insert or update on public.bugs
  for each row execute function public.on_bug_change();

-- Comments can belong to a bug as well as a task or the project thread.
alter table public.comments add column bug_id uuid references public.bugs (id) on delete cascade;
create index comments_bug_idx on public.comments (bug_id, created_at);
alter table public.comments add constraint comments_one_parent check (task_id is null or bug_id is null);

create or replace function public.prepare_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    if public.is_org_client(new.org_id) then
      new.is_internal := false;
    end if;
    if new.task_id is not null and not exists (
      select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
      raise exception 'Task belongs to another project';
    end if;
    if new.bug_id is not null and not exists (
      select 1 from public.bugs where id = new.bug_id and project_id = new.project_id) then
      raise exception 'Bug belongs to another project';
    end if;
  else
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    new.author_id := old.author_id;
    new.task_id := old.task_id;
    new.bug_id := old.bug_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
create policy comments_select on public.comments for select to authenticated using (
  public.can_view_project(project_id)
  and (task_id is null or public.can_view_task(task_id))
  and (bug_id is null or public.can_view_bug(bug_id))
  and (not is_internal or not public.is_org_client(org_id))
);
create policy comments_insert on public.comments for insert to authenticated with check (
  public.has_project_perm(project_id, 'comment.create')
  and (task_id is null or public.can_view_task(task_id))
  and (bug_id is null or public.can_view_bug(bug_id))
);

create or replace function public.on_comment_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _visible boolean;
  _author text;
  _user uuid;
  _where text;
  _link text;
begin
  select coalesce(full_name, email) into _author from public.profiles where id = new.author_id;
  if new.task_id is not null then
    select client_visible into _visible from public.tasks where id = new.task_id;
    _where := public.task_ref(new.task_id);
    _link := public.task_link(new.task_id);
  elsif new.bug_id is not null then
    select client_visible into _visible from public.bugs where id = new.bug_id;
    _where := public.bug_ref(new.bug_id);
    _link := '/go/bug/' || new.bug_id;
  else
    _visible := true;
    select name, '/go/project/' || id into _where, _link from public.projects where id = new.project_id;
  end if;

  perform public.log_activity(new.org_id, new.project_id, 'commented', 'comment', new.id,
    'commented on ' || _where, _visible and not new.is_internal);

  for _user in
    select m.user_id from public.org_members m
    join public.roles r on r.id = m.role_id
    join public.project_members pm on pm.project_id = new.project_id and pm.user_id = m.user_id
    where m.org_id = new.org_id and m.user_id = any (new.mentions)
      and (r.system_key is distinct from 'client' or (_visible and not new.is_internal))
  loop
    perform public.notify(_user, new.org_id, 'comment.mention', _author || ' mentioned you', _where, _link);
  end loop;

  if new.task_id is not null then
    for _user in select user_id from public.task_assignees where task_id = new.task_id
      and user_id <> all (new.mentions) loop
      perform public.notify(_user, new.org_id, 'comment.task', _author || ' commented', _where, _link);
    end loop;
  elsif new.bug_id is not null then
    for _user in select x from unnest((select array[assignee_id, reporter_id] from public.bugs where id = new.bug_id)) x
      where x is not null and x <> all (new.mentions) loop
      perform public.notify(_user, new.org_id, 'comment.bug', _author || ' commented', _where, _link);
    end loop;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Time tracking
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  bug_id uuid references public.bugs (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null default current_date,
  minutes int not null check (minutes between 1 and 1440),
  note text check (char_length(note) <= 500),
  billable boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index time_entries_user_idx on public.time_entries (user_id, work_date);
create index time_entries_project_idx on public.time_entries (project_id, work_date);

create or replace function public.guard_time_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _approver boolean;
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.status := 'draft';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.user_id := old.user_id;
    new.project_id := old.project_id;
    _approver := auth.uid() is null or public.has_project_perm(old.project_id, 'timesheet.approve');
    if new.status is distinct from old.status then
      if new.status in ('approved', 'rejected') then
        if not _approver or old.status <> 'submitted' then
          raise exception 'Only approvers can review submitted time';
        end if;
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      elsif new.status = 'submitted' and old.status not in ('draft', 'rejected') then
        raise exception 'Only draft or rejected time can be submitted';
      elsif new.status = 'draft' and old.status <> 'submitted' then
        raise exception 'Approved time cannot be reopened';
      end if;
    elsif old.status in ('submitted', 'approved') and not _approver then
      raise exception 'Submitted time is locked';
    end if;
  end if;
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'Task belongs to another project';
  end if;
  if new.bug_id is not null and not exists (select 1 from public.bugs where id = new.bug_id and project_id = new.project_id) then
    raise exception 'Bug belongs to another project';
  end if;
  return new;
end;
$$;

create trigger time_entries_org before insert or update on public.time_entries
  for each row execute function public.set_org_from_project();
create trigger time_entries_guard before insert or update on public.time_entries
  for each row execute function public.guard_time_entry();

alter table public.time_entries enable row level security;
create policy time_entries_select on public.time_entries for select to authenticated using (
  user_id = auth.uid()
  or public.has_project_perm(project_id, 'time.view_all')
  or public.has_project_perm(project_id, 'timesheet.approve')
);
create policy time_entries_insert on public.time_entries for insert to authenticated with check (
  user_id = auth.uid() and public.has_project_perm(project_id, 'time.log')
);
create policy time_entries_update on public.time_entries for update to authenticated
  using (user_id = auth.uid() or public.has_project_perm(project_id, 'timesheet.approve'))
  with check (user_id = auth.uid() or public.has_project_perm(project_id, 'timesheet.approve'));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (user_id = auth.uid() and status in ('draft', 'rejected'));

-- One running timer per person.
create table public.timers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  bug_id uuid references public.bugs (id) on delete cascade,
  note text,
  started_at timestamptz not null default now()
);

create trigger timers_org before insert or update on public.timers
  for each row execute function public.set_org_from_project();

alter table public.timers enable row level security;
create policy timers_own on public.timers for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.has_project_perm(project_id, 'time.log'));

-- ---------------------------------------------------------------------------
-- Project templates
-- ---------------------------------------------------------------------------
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  data jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.project_templates enable row level security;
create policy project_templates_select on public.project_templates for select to authenticated using (public.is_org_staff(org_id));
create policy project_templates_delete on public.project_templates for delete to authenticated
  using (public.has_org_perm(org_id, 'template.manage'));

-- Snapshot statuses, lists, tags, milestones and top-level tasks with subtasks.
-- Dates are stored as day offsets from the project start.
create or replace function public.save_project_as_template(_project uuid, _name text, _description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _p public.projects;
  _start date;
  _data jsonb;
  _id uuid;
begin
  select * into _p from public.projects where id = _project;
  if not found or not public.can_view_project(_project) or not public.has_org_perm(_p.org_id, 'template.manage') then
    raise exception 'Missing permission to save templates';
  end if;
  _start := coalesce(_p.start_date, _p.created_at::date);
  _data := jsonb_build_object(
    'duration_days', case when _p.end_date is not null then _p.end_date - _start end,
    'statuses', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'color', color, 'category', category) order by position), '[]')
                 from public.task_statuses where project_id = _project),
    'lists', (select coalesce(jsonb_agg(name order by position), '[]') from public.task_lists where project_id = _project),
    'tags', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'color', color)), '[]') from public.tags where project_id = _project),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'offset', due_date - _start, 'client_visible', client_visible)), '[]')
                   from public.milestones where project_id = _project),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
                'title', t.title, 'description', t.description, 'priority', t.priority,
                'list', (select name from public.task_lists where id = t.list_id),
                'start_offset', t.start_date - _start, 'due_offset', t.due_date - _start,
                'estimate_hours', t.estimate_hours, 'client_visible', t.client_visible,
                'subtasks', (select coalesce(jsonb_agg(s.title order by s.position, s.number), '[]')
                             from public.tasks s where s.parent_id = t.id))
              order by t.position, t.number), '[]')
              from public.tasks t where t.project_id = _project and t.parent_id is null)
  );
  insert into public.project_templates (org_id, name, description, data, created_by)
  values (_p.org_id, trim(_name), nullif(trim(_description), ''), _data, auth.uid())
  returning id into _id;
  return _id;
end;
$$;

create or replace function public.create_project_from_template(
  _template uuid, _name text, _key text, _start date, _color text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  _t public.project_templates;
  _project uuid;
  _start_date date := coalesce(_start, current_date);
  _item jsonb;
  _task uuid;
  _sub text;
begin
  select * into _t from public.project_templates where id = _template;
  if not found or not public.is_org_staff(_t.org_id) or not public.has_org_perm(_t.org_id, 'project.create') then
    raise exception 'Missing permission to create projects';
  end if;

  insert into public.projects (org_id, key, name, color, start_date, end_date, description)
  values (_t.org_id, upper(_key), trim(_name), coalesce(_color, '#4f46e5'), _start_date,
    _start_date + (_t.data ->> 'duration_days')::int, _t.description)
  returning id into _project;

  -- Replace the default structure with the template's.
  if jsonb_array_length(_t.data -> 'statuses') > 0 then
    delete from public.task_statuses where project_id = _project;
    insert into public.task_statuses (project_id, org_id, name, color, category, position)
    select _project, _t.org_id, s ->> 'name', s ->> 'color', s ->> 'category', ord - 1
    from jsonb_array_elements(_t.data -> 'statuses') with ordinality as x(s, ord);
  end if;
  if jsonb_array_length(_t.data -> 'lists') > 0 then
    delete from public.task_lists where project_id = _project;
    insert into public.task_lists (project_id, org_id, name, position)
    select _project, _t.org_id, l #>> '{}', ord - 1
    from jsonb_array_elements(_t.data -> 'lists') with ordinality as x(l, ord);
  end if;
  insert into public.tags (project_id, org_id, name, color)
  select _project, _t.org_id, g ->> 'name', g ->> 'color' from jsonb_array_elements(_t.data -> 'tags') g
  on conflict do nothing;
  insert into public.milestones (project_id, org_id, name, due_date, client_visible)
  select _project, _t.org_id, m ->> 'name', _start_date + (m ->> 'offset')::int, coalesce((m ->> 'client_visible')::boolean, true)
  from jsonb_array_elements(_t.data -> 'milestones') m;

  for _item in select * from jsonb_array_elements(_t.data -> 'tasks') loop
    insert into public.tasks (project_id, list_id, title, description, priority, start_date, due_date,
      estimate_hours, client_visible, position)
    values (_project,
      (select id from public.task_lists where project_id = _project and name = _item ->> 'list' limit 1),
      _item ->> 'title', _item ->> 'description', coalesce(_item ->> 'priority', 'none'),
      _start_date + (_item ->> 'start_offset')::int, _start_date + (_item ->> 'due_offset')::int,
      (_item ->> 'estimate_hours')::numeric, coalesce((_item ->> 'client_visible')::boolean, false),
      extract(epoch from clock_timestamp()))
    returning id into _task;
    for _sub in select jsonb_array_elements_text(_item -> 'subtasks') loop
      insert into public.tasks (project_id, parent_id, title, position)
      values (_project, _task, _sub, extract(epoch from clock_timestamp()));
    end loop;
  end loop;

  return upper(_key);
end;
$$;
