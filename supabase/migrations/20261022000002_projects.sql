-- Projects and work items.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  color text not null default '#4f46e5',
  start_date date,
  end_date date,
  owner_id uuid references public.profiles (id) on delete set null,
  task_seq int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create index projects_org_idx on public.projects (org_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role_override_id uuid,
  added_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (role_override_id, org_id) references public.roles (id, org_id) on delete set null (role_override_id)
);

create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- Project-level helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_view_project(_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.projects p
    join public.organizations o on o.id = p.org_id and o.status = 'active'
    join public.org_members m on m.org_id = p.org_id and m.user_id = auth.uid() and m.status = 'active'
    join public.roles r on r.id = m.role_id
    left join public.project_members pm on pm.project_id = p.id and pm.user_id = auth.uid()
    where p.id = _project
      and (
        r.system_key = 'org_admin'
        or pm.user_id is not null
        or (r.system_key is null and 'project.view_all' = any (r.permissions))
      )
  );
$$;

-- Project permission: org role, or the project override when one is set.
create or replace function public.has_project_perm(_project uuid, _perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.projects p
    join public.organizations o on o.id = p.org_id and o.status = 'active'
    join public.org_members m on m.org_id = p.org_id and m.user_id = auth.uid() and m.status = 'active'
    join public.roles r on r.id = m.role_id
    left join public.project_members pm on pm.project_id = p.id and pm.user_id = auth.uid()
    left join public.roles ro on ro.id = pm.role_override_id
    where p.id = _project
      and (
        r.system_key = 'org_admin'
        or (
          (pm.user_id is not null or (r.system_key is null and 'project.view_all' = any (r.permissions)))
          and _perm = any (coalesce(ro.permissions, r.permissions))
        )
      )
  );
$$;

create or replace function public.project_org(_project uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.projects where id = _project;
$$;

-- Children inherit org_id from their project so policies can stay simple.
create or replace function public.set_org_from_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'Items cannot move between projects';
  end if;
  select org_id into new.org_id from public.projects where id = new.project_id;
  if new.org_id is null then
    raise exception 'Project not found';
  end if;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
create table public.task_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#64748b',
  category text not null default 'todo' check (category in ('todo', 'in_progress', 'done')),
  position int not null default 0,
  unique (project_id, name)
);

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  client_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  color text not null default '#0ea5e9',
  unique (project_id, name)
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  list_id uuid references public.task_lists (id) on delete set null,
  milestone_id uuid references public.milestones (id) on delete set null,
  parent_id uuid references public.tasks (id) on delete cascade,
  number int not null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  status_id uuid references public.task_statuses (id) on delete set null,
  priority text not null default 'none' check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  start_date date,
  due_date date,
  estimate_hours numeric(7, 2),
  client_visible boolean not null default false,
  position double precision not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, number)
);

create index tasks_project_idx on public.tasks (project_id, status_id, position);
create index tasks_parent_idx on public.tasks (parent_id);
create index tasks_due_idx on public.tasks (due_date) where completed_at is null;
create index tasks_search_idx on public.tasks using gin (to_tsvector('simple', title || ' ' || coalesce(description, '')));

create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (task_id, tag_id)
);

-- Task bookkeeping: number, defaults, same-project references, client rules.
create or replace function public.prepare_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _category text;
begin
  if tg_op = 'INSERT' then
    update public.projects set task_seq = task_seq + 1
    where id = new.project_id
    returning task_seq into new.number;
    new.created_by := coalesce(auth.uid(), new.created_by);

    if new.status_id is null then
      select id into new.status_id from public.task_statuses
      where project_id = new.project_id order by position limit 1;
    end if;

    -- Client requests are always visible to clients.
    if public.is_org_client(new.org_id) then
      new.client_visible := true;
      new.parent_id := null;
    end if;
  else
    new.number := old.number;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;

  if new.list_id is not null and not exists (
    select 1 from public.task_lists where id = new.list_id and project_id = new.project_id) then
    raise exception 'List belongs to another project';
  end if;
  if new.status_id is not null and not exists (
    select 1 from public.task_statuses where id = new.status_id and project_id = new.project_id) then
    raise exception 'Status belongs to another project';
  end if;
  if new.milestone_id is not null and not exists (
    select 1 from public.milestones where id = new.milestone_id and project_id = new.project_id) then
    raise exception 'Milestone belongs to another project';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists (
      select 1 from public.tasks where id = new.parent_id and project_id = new.project_id and parent_id is null) then
      raise exception 'Subtasks must sit under a top-level task in the same project';
    end if;
  end if;

  select category into _category from public.task_statuses where id = new.status_id;
  if _category = 'done' and new.completed_at is null then
    new.completed_at := now();
  elsif _category is distinct from 'done' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger tasks_org before insert or update on public.tasks
  for each row execute function public.set_org_from_project();
create trigger tasks_prepare before insert or update on public.tasks
  for each row execute function public.prepare_task();

-- Assignees and tags copy org/project from their task.
create or replace function public.set_scope_from_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id, project_id into new.org_id, new.project_id from public.tasks where id = new.task_id;
  if new.project_id is null then
    raise exception 'Task not found';
  end if;
  return new;
end;
$$;

create trigger task_assignees_0_scope before insert on public.task_assignees
  for each row execute function public.set_scope_from_task();
create trigger task_tags_0_scope before insert on public.task_tags
  for each row execute function public.set_scope_from_task();

create or replace function public.guard_task_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.project_members pm
    join public.org_members m on m.org_id = pm.org_id and m.user_id = pm.user_id and m.status = 'active'
    join public.roles r on r.id = m.role_id
    where pm.project_id = new.project_id and pm.user_id = new.user_id
      and r.system_key is distinct from 'client'
  ) then
    raise exception 'Assignees must be team members of the project';
  end if;
  new.assigned_by := auth.uid();
  return new;
end;
$$;

create trigger task_assignees_guard before insert on public.task_assignees
  for each row execute function public.guard_task_assignee();

create or replace function public.guard_task_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tags where id = new.tag_id and project_id = new.project_id) then
    raise exception 'Tag belongs to another project';
  end if;
  return new;
end;
$$;

create trigger task_tags_guard before insert on public.task_tags
  for each row execute function public.guard_task_tag();

-- Can the caller see this task? Clients only see client-visible tasks.
create or replace function public.can_view_task(_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = _task
      and public.can_view_project(t.project_id)
      and (t.client_visible or not public.is_org_client(t.org_id))
  );
$$;

create or replace function public.can_edit_task(_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = _task
      and not public.is_org_client(t.org_id)
      and (
        public.has_project_perm(t.project_id, 'task.edit')
        or (
          public.has_project_perm(t.project_id, 'task.edit_own')
          and (t.created_by = auth.uid() or exists (
            select 1 from public.task_assignees a where a.task_id = t.id and a.user_id = auth.uid()))
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Comments and attachments
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade, -- null = project thread
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  is_internal boolean not null default false,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index comments_task_idx on public.comments (task_id, created_at);
create index comments_project_idx on public.comments (project_id, created_at) where task_id is null;

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
  else
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    new.author_id := old.author_id;
    new.task_id := old.task_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger comments_org before insert or update on public.comments
  for each row execute function public.set_org_from_project();
create trigger comments_prepare before insert or update on public.comments
  for each row execute function public.prepare_comment();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  client_visible boolean not null default false,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index attachments_project_idx on public.attachments (project_id, created_at);

create or replace function public.prepare_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if public.is_org_client(new.org_id) then
    new.client_visible := true;
  end if;
  if split_part(new.storage_path, '/', 1) <> new.org_id::text
     or split_part(new.storage_path, '/', 2) <> new.project_id::text then
    raise exception 'Storage path must start with org/project';
  end if;
  return new;
end;
$$;

create trigger attachments_org before insert or update on public.attachments
  for each row execute function public.set_org_from_project();
create trigger attachments_prepare before insert on public.attachments
  for each row execute function public.prepare_attachment();

-- ---------------------------------------------------------------------------
-- Project bootstrap and member guard
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_statuses (project_id, org_id, name, color, category, position) values
    (new.id, new.org_id, 'To do',       '#64748b', 'todo',        0),
    (new.id, new.org_id, 'In progress', '#2563eb', 'in_progress', 1),
    (new.id, new.org_id, 'In review',   '#9333ea', 'in_progress', 2),
    (new.id, new.org_id, 'Done',        '#16a34a', 'done',        3);
  insert into public.task_lists (project_id, org_id, name, position) values (new.id, new.org_id, 'General', 0);
  -- Platform admins can create projects in orgs they do not belong to.
  if new.created_by is not null and exists (
    select 1 from public.org_members where org_id = new.org_id and user_id = new.created_by
  ) then
    insert into public.project_members (project_id, user_id, org_id)
    values (new.id, new.created_by, new.org_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.prepare_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.key := upper(new.key);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.owner_id := coalesce(new.owner_id, new.created_by);
    new.task_seq := 0;
  else
    new.org_id := old.org_id;
    new.created_by := old.created_by;
    new.updated_at := now();
    if new.task_seq < old.task_seq then
      new.task_seq := old.task_seq;
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_prepare before insert or update on public.projects
  for each row execute function public.prepare_project();
create trigger projects_bootstrap after insert on public.projects
  for each row execute function public.bootstrap_project();

create or replace function public.guard_project_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _member_key text;
  _override_key text;
begin
  select org_id into new.org_id from public.projects where id = new.project_id;
  select r.system_key into _member_key
  from public.org_members m join public.roles r on r.id = m.role_id
  where m.org_id = new.org_id and m.user_id = new.user_id;
  if not found then
    raise exception 'Only organization members can join a project';
  end if;
  if new.role_override_id is not null then
    select system_key into _override_key from public.roles where id = new.role_override_id;
    if _override_key is not null or _member_key is not null then
      raise exception 'Project role overrides only apply to custom roles';
    end if;
  end if;
  return new;
end;
$$;

create trigger project_members_guard before insert or update on public.project_members
  for each row execute function public.guard_project_member();

-- Accept an invitation for the signed-in user.
create or replace function public.accept_invitation(_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  _inv public.invitations;
  _email text;
  _slug text;
  _existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into _inv from public.invitations where token = _token for update;
  if not found then
    raise exception 'Invitation not found';
  end if;
  if _inv.accepted_at is not null then
    raise exception 'Invitation already used';
  end if;
  if _inv.expires_at < now() then
    raise exception 'Invitation expired';
  end if;
  select email into _email from public.profiles where id = auth.uid();
  if lower(_email) <> _inv.email then
    raise exception 'This invitation was sent to %', _inv.email;
  end if;

  perform set_config('app.accepting_invite', 'on', true);
  select role_id into _existing from public.org_members where org_id = _inv.org_id and user_id = auth.uid();
  if _existing is null then
    insert into public.org_members (org_id, user_id, role_id) values (_inv.org_id, auth.uid(), _inv.role_id);
  else
    update public.org_members set status = 'active' where org_id = _inv.org_id and user_id = auth.uid();
  end if;

  insert into public.project_members (project_id, user_id, org_id)
  select p.id, auth.uid(), p.org_id from public.projects p
  where p.id = any (_inv.project_ids) and p.org_id = _inv.org_id
  on conflict do nothing;

  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = _inv.id;
  perform set_config('app.accepting_invite', 'off', true);

  select slug into _slug from public.organizations where id = _inv.org_id;
  return _slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.task_statuses enable row level security;
alter table public.task_lists enable row level security;
alter table public.milestones enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_tags enable row level security;
alter table public.comments enable row level security;
alter table public.attachments enable row level security;

create policy projects_select on public.projects for select to authenticated using (public.can_view_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (public.has_org_perm(org_id, 'project.create'));
create policy projects_update on public.projects for update to authenticated
  using (public.has_project_perm(id, 'project.edit')) with check (public.has_project_perm(id, 'project.edit'));
create policy projects_delete on public.projects for delete to authenticated using (public.has_project_perm(id, 'project.delete'));

-- Clients see the staff on their projects but not other clients.
create policy project_members_select on public.project_members for select to authenticated using (
  public.can_view_project(project_id)
  and (
    not public.is_org_client(org_id)
    or user_id = auth.uid()
    or not exists (
      select 1 from public.org_members m join public.roles r on r.id = m.role_id
      where m.org_id = project_members.org_id and m.user_id = project_members.user_id and r.system_key = 'client'
    )
  )
);
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.has_project_perm(project_id, 'project.manage_members'));
create policy project_members_update on public.project_members for update to authenticated
  using (public.has_project_perm(project_id, 'project.manage_members'))
  with check (public.has_project_perm(project_id, 'project.manage_members'));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.has_project_perm(project_id, 'project.manage_members'));

-- Profiles of project co-members (lets clients see the staff they work with).
create policy profiles_select_project on public.profiles for select to authenticated using (
  exists (
    select 1 from public.project_members theirs
    where theirs.user_id = profiles.id and public.can_view_project(theirs.project_id)
  )
);

-- Structure tables: visible with the project, edited with project.edit.
create policy task_statuses_select on public.task_statuses for select to authenticated using (public.can_view_project(project_id));
create policy task_statuses_write on public.task_statuses for all to authenticated
  using (public.has_project_perm(project_id, 'project.edit')) with check (public.has_project_perm(project_id, 'project.edit'));

create policy task_lists_select on public.task_lists for select to authenticated using (public.can_view_project(project_id));
create policy task_lists_write on public.task_lists for all to authenticated
  using (public.has_project_perm(project_id, 'project.edit')) with check (public.has_project_perm(project_id, 'project.edit'));

create policy tags_select on public.tags for select to authenticated using (public.can_view_project(project_id));
create policy tags_write on public.tags for all to authenticated
  using (public.has_project_perm(project_id, 'project.edit')) with check (public.has_project_perm(project_id, 'project.edit'));

create policy milestones_select on public.milestones for select to authenticated using (
  public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id))
);
create policy milestones_write on public.milestones for all to authenticated
  using (public.has_project_perm(project_id, 'milestone.manage')) with check (public.has_project_perm(project_id, 'milestone.manage'));

create policy tasks_select on public.tasks for select to authenticated using (
  public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id))
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  public.has_project_perm(project_id, 'task.create')
);
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(id)) with check (public.can_view_project(project_id));
create policy tasks_delete on public.tasks for delete to authenticated using (
  public.has_project_perm(project_id, 'task.delete')
);

create policy task_assignees_select on public.task_assignees for select to authenticated using (public.can_view_task(task_id));
create policy task_assignees_insert on public.task_assignees for insert to authenticated with check (
  public.has_project_perm(project_id, 'task.assign')
);
create policy task_assignees_delete on public.task_assignees for delete to authenticated using (
  public.has_project_perm(project_id, 'task.assign')
);

create policy task_tags_select on public.task_tags for select to authenticated using (public.can_view_task(task_id));
create policy task_tags_insert on public.task_tags for insert to authenticated with check (public.can_edit_task(task_id));
create policy task_tags_delete on public.task_tags for delete to authenticated using (public.can_edit_task(task_id));

create policy comments_select on public.comments for select to authenticated using (
  public.can_view_project(project_id)
  and (task_id is null or public.can_view_task(task_id))
  and (not is_internal or not public.is_org_client(org_id))
);
create policy comments_insert on public.comments for insert to authenticated with check (
  public.has_project_perm(project_id, 'comment.create')
  and (task_id is null or public.can_view_task(task_id))
);
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (
  author_id = auth.uid() or public.has_project_perm(project_id, 'comment.delete_any')
);

create policy attachments_select on public.attachments for select to authenticated using (
  public.can_view_project(project_id)
  and (task_id is null or public.can_view_task(task_id))
  and (client_visible or not public.is_org_client(org_id))
);
create policy attachments_insert on public.attachments for insert to authenticated with check (
  public.has_project_perm(project_id, 'file.upload')
  and (task_id is null or public.can_view_task(task_id))
);
create policy attachments_update on public.attachments for update to authenticated
  using (not public.is_org_client(org_id) and (uploaded_by = auth.uid() or public.has_project_perm(project_id, 'file.delete_any')))
  with check (not public.is_org_client(org_id));
create policy attachments_delete on public.attachments for delete to authenticated using (
  uploaded_by = auth.uid() or public.has_project_perm(project_id, 'file.delete_any')
);
