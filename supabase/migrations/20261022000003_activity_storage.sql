-- Activity feed, notifications, file storage.

create table public.activity_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  client_visible boolean not null default false,
  created_at timestamptz not null default now()
);

create index activity_project_idx on public.activity_log (project_id, created_at desc);
create index activity_org_idx on public.activity_log (org_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;

create policy activity_select on public.activity_log for select to authenticated using (
  (project_id is null and public.is_org_staff(org_id))
  or (public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id)))
);

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Writers (security definer; nothing inserts these tables directly)
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  _org uuid, _project uuid, _action text, _type text, _entity uuid, _summary text, _client boolean
) returns void language sql security definer set search_path = '' as $$
  insert into public.activity_log (org_id, project_id, actor_id, action, entity_type, entity_id, summary, client_visible)
  values (_org, _project, auth.uid(), _action, _type, _entity, _summary, _client);
$$;

create or replace function public.notify(
  _user uuid, _org uuid, _type text, _title text, _body text, _link text
) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, org_id, type, title, body, link)
  select _user, _org, _type, _title, _body, _link
  where _user is not null and _user is distinct from auth.uid();
$$;

revoke execute on function public.log_activity(uuid, uuid, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.task_link(_task uuid)
returns text language sql stable security definer set search_path = '' as $$
  -- Resolved per viewer by the app (/go/task/:id), so clients land in the portal.
  select '/go/task/' || t.id
  from public.tasks t
  where t.id = _task and (auth.uid() is null or public.can_view_task(t.id));
$$;

create or replace function public.task_ref(_task uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.key || '-' || t.number || ' ' || t.title
  from public.tasks t join public.projects p on p.id = t.project_id
  where t.id = _task and (auth.uid() is null or public.can_view_task(t.id));
$$;

revoke execute on function public.task_link(uuid) from public, anon;
revoke execute on function public.task_ref(uuid) from public, anon;
grant execute on function public.task_link(uuid) to authenticated;
grant execute on function public.task_ref(uuid) to authenticated;

create or replace function public.on_task_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _status text;
  _user uuid;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.org_id, new.project_id, 'created', 'task', new.id,
      'created ' || public.task_ref(new.id), new.client_visible);
  elsif new.status_id is distinct from old.status_id then
    select name into _status from public.task_statuses where id = new.status_id;
    perform public.log_activity(new.org_id, new.project_id, 'status', 'task', new.id,
      'moved ' || public.task_ref(new.id) || ' to ' || coalesce(_status, 'no status'), new.client_visible);
    for _user in select user_id from public.task_assignees where task_id = new.id
      union select new.created_by loop
      perform public.notify(_user, new.org_id, 'task.status',
        public.task_ref(new.id), 'Status changed to ' || coalesce(_status, 'none'), public.task_link(new.id));
    end loop;
  end if;
  return null;
end;
$$;

create trigger tasks_activity after insert or update on public.tasks
  for each row execute function public.on_task_change();

create or replace function public.on_task_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.user_id, new.org_id, 'task.assigned',
    'Assigned to you: ' || public.task_ref(new.task_id), null, public.task_link(new.task_id));
  return null;
end;
$$;

create trigger task_assignees_notify after insert on public.task_assignees
  for each row execute function public.on_task_assigned();

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
  else
    _visible := true;
    select name, '/go/project/' || id into _where, _link
    from public.projects where id = new.project_id;
  end if;

  perform public.log_activity(new.org_id, new.project_id, 'commented', 'comment', new.id,
    'commented on ' || _where, _visible and not new.is_internal);

  -- Mentions: only people who can actually read the comment.
  for _user in
    select m.user_id from public.org_members m
    join public.roles r on r.id = m.role_id
    join public.project_members pm on pm.project_id = new.project_id and pm.user_id = m.user_id
    where m.org_id = new.org_id and m.user_id = any (new.mentions)
      and (r.system_key is distinct from 'client' or (_visible and not new.is_internal))
  loop
    perform public.notify(_user, new.org_id, 'comment.mention',
      _author || ' mentioned you', _where, _link);
  end loop;

  -- Assignees of the task hear about new comments too.
  if new.task_id is not null then
    for _user in select user_id from public.task_assignees where task_id = new.task_id
      and user_id <> all (new.mentions) loop
      perform public.notify(_user, new.org_id, 'comment.task', _author || ' commented', _where, _link);
    end loop;
  end if;
  return null;
end;
$$;

create trigger comments_activity after insert on public.comments
  for each row execute function public.on_comment_created();

create or replace function public.on_attachment_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.org_id, new.project_id, 'uploaded', 'file', new.id,
    'uploaded ' || new.file_name, new.client_visible);
  return null;
end;
$$;

create trigger attachments_activity after insert on public.attachments
  for each row execute function public.on_attachment_created();

create or replace function public.on_project_member_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _name text;
  _project text;
  _link text;
begin
  select coalesce(full_name, email) into _name from public.profiles where id = new.user_id;
  select name, '/go/project/' || id into _project, _link
  from public.projects where id = new.project_id;
  perform public.log_activity(new.org_id, new.project_id, 'member_added', 'member', new.user_id,
    'added ' || _name || ' to the project', false);
  perform public.notify(new.user_id, new.org_id, 'project.added', 'Added to ' || _project, null, _link);
  return null;
end;
$$;

create trigger project_members_activity after insert on public.project_members
  for each row execute function public.on_project_member_added();

-- Clients sign off on work that is waiting on them.
create or replace function public.client_approve_task(_task uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _t public.tasks;
  _done uuid;
begin
  select * into _t from public.tasks where id = _task;
  if not found or not public.is_org_client(_t.org_id) or not public.can_view_task(_task) then
    raise exception 'Only the project client can approve this task';
  end if;
  if _t.completed_at is not null then
    return;
  end if;
  select id into _done from public.task_statuses
  where project_id = _t.project_id and category = 'done' order by position limit 1;
  update public.tasks set status_id = _done where id = _task;
  perform public.log_activity(_t.org_id, _t.project_id, 'approved', 'task', _task,
    'approved ' || public.task_ref(_task), true);
end;
$$;

-- Live notification bell.
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, paths are {org_id}/{project_id}/{uuid}-{file name}.
-- Reads go through the attachments table so client visibility applies.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create or replace function public.try_uuid(_value text)
returns uuid language plpgsql immutable as $$
begin
  return _value::uuid;
exception when others then
  return null;
end;
$$;

create policy attachments_object_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments'
  and exists (select 1 from public.attachments a where a.storage_path = storage.objects.name)
);

create policy attachments_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments'
  and public.has_project_perm(public.try_uuid((storage.foldername(name))[2]), 'file.upload')
  and public.project_org(public.try_uuid((storage.foldername(name))[2])) = public.try_uuid((storage.foldername(name))[1])
);

create policy attachments_object_delete on storage.objects for delete to authenticated using (
  bucket_id = 'attachments'
  and exists (
    select 1 from public.attachments a
    where a.storage_path = storage.objects.name
      and (a.uploaded_by = auth.uid() or public.has_project_perm(a.project_id, 'file.delete_any'))
  )
);
