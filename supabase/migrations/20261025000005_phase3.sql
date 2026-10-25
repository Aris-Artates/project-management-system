-- Phase 3: wiki pages, discussion topics, project chat, events.
-- Select policies use the row's own columns; cross-table checks go through
-- security definer helpers so policies never recurse.

insert into public.permission_catalog (key, module, label, description, scope, client_safe, sort) values
  ('report.view',    'Organization', 'View reports and portfolio', 'Org-wide reports, dashboards and portfolio', 'org',     false, 15),
  ('doc.edit',       'Docs',         'Write and edit pages',       null,                                         'project', false, 90),
  ('doc.delete',     'Docs',         'Delete pages',               null,                                         'project', false, 91),
  ('forum.post',     'Discussions',  'Start discussions',          'Clients can start topics shared with them',  'project', true,  95),
  ('forum.moderate', 'Discussions',  'Moderate discussions',       'Pin, lock and delete topics',                'project', false, 96),
  ('chat.use',       'Discussions',  'Use project chat',           'Team chat; never visible to clients',        'project', false, 97),
  ('event.manage',   'Events',       'Manage events',              'Create and edit meetings and events',        'project', false, 100)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Wiki pages
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.documents (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 200000),
  client_visible boolean not null default false,
  position double precision not null default 0,
  version int not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_project_idx on public.documents (project_id, parent_id, position);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  version int not null,
  title text not null,
  body text not null,
  edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create or replace function public.prepare_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.version := 1;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.title is distinct from old.title or new.body is distinct from old.body then
      -- Keep the previous text as a version before overwriting it.
      insert into public.document_versions (document_id, org_id, project_id, version, title, body, edited_by, created_at)
      values (old.id, old.org_id, old.project_id, old.version, old.title, old.body, old.updated_by, old.updated_at);
      new.version := old.version + 1;
      new.updated_by := coalesce(auth.uid(), new.updated_by);
      new.updated_at := now();
    else
      new.version := old.version;
    end if;
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists (
      select 1 from public.documents where id = new.parent_id and project_id = new.project_id) then
      raise exception 'Parent page must be in the same project';
    end if;
  end if;
  return new;
end;
$$;

create trigger documents_org before insert or update on public.documents
  for each row execute function public.set_org_from_project();
create trigger documents_prepare before insert or update on public.documents
  for each row execute function public.prepare_document();

create or replace function public.on_document_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.org_id, new.project_id, 'doc_created', 'document', new.id, 'created the page ' || new.title, new.client_visible);
  elsif new.version <> old.version then
    perform public.log_activity(new.org_id, new.project_id, 'doc_edited', 'document', new.id, 'edited the page ' || new.title, new.client_visible);
  end if;
  return null;
end;
$$;

create trigger documents_activity after insert or update on public.documents
  for each row execute function public.on_document_change();

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;

create policy documents_select on public.documents for select to authenticated using (
  public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id))
);
create policy documents_insert on public.documents for insert to authenticated
  with check (public.has_project_perm(project_id, 'doc.edit'));
create policy documents_update on public.documents for update to authenticated
  using (public.has_project_perm(project_id, 'doc.edit')) with check (public.has_project_perm(project_id, 'doc.edit'));
create policy documents_delete on public.documents for delete to authenticated
  using (public.has_project_perm(project_id, 'doc.delete'));

-- History is for the team only.
create policy document_versions_select on public.document_versions for select to authenticated using (
  public.can_view_project(project_id) and public.is_org_staff(org_id)
);

-- ---------------------------------------------------------------------------
-- Discussion topics (replies are comments with topic_id)
-- ---------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  author_id uuid references public.profiles (id) on delete set null,
  pinned boolean not null default false,
  locked boolean not null default false,
  client_visible boolean not null default true,
  reply_count int not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index topics_project_idx on public.topics (project_id, pinned desc, last_activity_at desc);

create or replace function public.prepare_topic()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    new.reply_count := 0;
    new.last_activity_at := now();
    if public.is_org_client(new.org_id) then
      new.client_visible := true;
      new.pinned := false;
      new.locked := false;
    end if;
  else
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    if (new.pinned is distinct from old.pinned or new.locked is distinct from old.locked)
       and auth.uid() is not null and not public.has_project_perm(new.project_id, 'forum.moderate') then
      raise exception 'Only moderators can pin or lock topics';
    end if;
  end if;
  return new;
end;
$$;

create trigger topics_org before insert or update on public.topics
  for each row execute function public.set_org_from_project();
create trigger topics_prepare before insert or update on public.topics
  for each row execute function public.prepare_topic();

create or replace function public.on_topic_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_activity(new.org_id, new.project_id, 'topic', 'topic', new.id, 'started the discussion ' || new.title, new.client_visible);
  return null;
end;
$$;

create trigger topics_activity after insert on public.topics
  for each row execute function public.on_topic_created();

create or replace function public.can_view_topic(_topic uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.topics t
    where t.id = _topic and public.can_view_project(t.project_id)
      and (t.client_visible or not public.is_org_client(t.org_id))
  );
$$;

alter table public.topics enable row level security;
create policy topics_select on public.topics for select to authenticated using (
  public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id))
);
create policy topics_insert on public.topics for insert to authenticated
  with check (public.has_project_perm(project_id, 'forum.post'));
create policy topics_update on public.topics for update to authenticated
  using (
    not public.is_org_client(org_id)
    and (author_id = auth.uid() or public.has_project_perm(project_id, 'forum.moderate'))
  )
  with check (public.can_view_project(project_id));
create policy topics_delete on public.topics for delete to authenticated
  using (author_id = auth.uid() or public.has_project_perm(project_id, 'forum.moderate'));

alter table public.comments add column topic_id uuid references public.topics (id) on delete cascade;
create index comments_topic_idx on public.comments (topic_id, created_at);
alter table public.comments drop constraint comments_one_parent;
alter table public.comments add constraint comments_one_parent check (num_nonnulls(task_id, bug_id, topic_id) <= 1);

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
    if new.topic_id is not null then
      if not exists (select 1 from public.topics where id = new.topic_id and project_id = new.project_id) then
        raise exception 'Topic belongs to another project';
      end if;
      if exists (select 1 from public.topics where id = new.topic_id and locked)
         and auth.uid() is not null and not public.has_project_perm(new.project_id, 'forum.moderate') then
        raise exception 'This discussion is locked';
      end if;
    end if;
  else
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    new.author_id := old.author_id;
    new.task_id := old.task_id;
    new.bug_id := old.bug_id;
    new.topic_id := old.topic_id;
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
  and (topic_id is null or public.can_view_topic(topic_id))
  and (not is_internal or not public.is_org_client(org_id))
);
create policy comments_insert on public.comments for insert to authenticated with check (
  public.has_project_perm(project_id, 'comment.create')
  and (task_id is null or public.can_view_task(task_id))
  and (bug_id is null or public.can_view_bug(bug_id))
  and (topic_id is null or public.can_view_topic(topic_id))
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
  elsif new.topic_id is not null then
    select client_visible, title into _visible, _where from public.topics where id = new.topic_id;
    _link := '/go/topic/' || new.topic_id;
    update public.topics set reply_count = reply_count + 1, last_activity_at = now() where id = new.topic_id;
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
  elsif new.topic_id is not null then
    for _user in select author_id from public.topics where id = new.topic_id
      and author_id is not null and author_id <> all (new.mentions) loop
      perform public.notify(_user, new.org_id, 'comment.topic', _author || ' replied', _where, _link);
    end loop;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project chat (team only)
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index chat_messages_project_idx on public.chat_messages (project_id, created_at desc);

create or replace function public.prepare_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger chat_messages_org before insert or update on public.chat_messages
  for each row execute function public.set_org_from_project();
create trigger chat_messages_prepare before insert or update on public.chat_messages
  for each row execute function public.prepare_chat_message();

alter table public.chat_messages enable row level security;
create policy chat_messages_select on public.chat_messages for select to authenticated using (
  public.can_view_project(project_id) and public.is_org_staff(org_id)
);
create policy chat_messages_insert on public.chat_messages for insert to authenticated with check (
  author_id = auth.uid() and public.is_org_staff(org_id) and public.has_project_perm(project_id, 'chat.use')
);
create policy chat_messages_update on public.chat_messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (author_id = auth.uid() or public.has_project_perm(project_id, 'forum.moderate'));

alter publication supabase_realtime add table public.chat_messages;

-- ---------------------------------------------------------------------------
-- Events and attendees
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade, -- null = organization-wide
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  location text check (char_length(location) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  client_visible boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index events_org_idx on public.events (org_id, starts_at);
create index events_project_idx on public.events (project_id, starts_at);

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'yes', 'maybe', 'no')),
  primary key (event_id, user_id)
);

create index event_attendees_user_idx on public.event_attendees (user_id);

create or replace function public.prepare_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null then
    if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
      raise exception 'Events cannot move between projects';
    end if;
    select org_id into new.org_id from public.projects where id = new.project_id;
  elsif tg_op = 'UPDATE' then
    new.org_id := old.org_id;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger events_prepare before insert or update on public.events
  for each row execute function public.prepare_event();

create or replace function public.is_event_attendee(_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_attendees where event_id = _event and user_id = auth.uid());
$$;

create or replace function public.can_manage_event(_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = _event and not public.is_org_client(e.org_id)
      and (
        e.created_by = auth.uid()
        or (e.project_id is null and public.has_org_perm(e.org_id, 'event.manage'))
        or (e.project_id is not null and public.has_project_perm(e.project_id, 'event.manage'))
      )
  );
$$;

create or replace function public.can_view_event(_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = _event and (
      public.is_event_attendee(e.id)
      or (e.project_id is null and public.is_org_staff(e.org_id))
      or (e.project_id is not null and public.can_view_project(e.project_id)
          and (e.client_visible or not public.is_org_client(e.org_id)))
    )
  );
$$;

alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

create policy events_select on public.events for select to authenticated using (
  public.is_event_attendee(id)
  or (project_id is null and public.is_org_staff(org_id))
  or (project_id is not null and public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id)))
);
create policy events_insert on public.events for insert to authenticated with check (
  not public.is_org_client(org_id)
  and (
    (project_id is null and public.has_org_perm(org_id, 'event.manage'))
    or (project_id is not null and public.has_project_perm(project_id, 'event.manage'))
  )
);
create policy events_update on public.events for update to authenticated
  using (public.can_manage_event(id)) with check (not public.is_org_client(org_id));
create policy events_delete on public.events for delete to authenticated using (public.can_manage_event(id));

create or replace function public.guard_event_attendee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _e public.events;
begin
  if tg_op = 'INSERT' then
    select * into _e from public.events where id = new.event_id;
    new.org_id := _e.org_id;
    if not exists (select 1 from public.org_members where org_id = _e.org_id and user_id = new.user_id and status = 'active') then
      raise exception 'Attendees must be members of the organization';
    end if;
    if _e.project_id is not null and not exists (
      select 1 from public.project_members where project_id = _e.project_id and user_id = new.user_id) then
      raise exception 'Attendees must be on the project';
    end if;
    new.response := case when new.user_id = auth.uid() then 'yes' else 'pending' end;
  else
    if new.event_id <> old.event_id or new.user_id <> old.user_id then
      raise exception 'Only the response can change';
    end if;
    new.org_id := old.org_id;
  end if;
  return new;
end;
$$;

create trigger event_attendees_guard before insert or update on public.event_attendees
  for each row execute function public.guard_event_attendee();

create or replace function public.on_event_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _e public.events;
begin
  select * into _e from public.events where id = new.event_id;
  perform public.notify(new.user_id, _e.org_id, 'event.invited', 'Invited: ' || _e.title,
    to_char(_e.starts_at at time zone 'UTC', 'Mon DD, HH24:MI "UTC"'), '/go/event/' || _e.id);
  return null;
end;
$$;

create trigger event_attendees_notify after insert on public.event_attendees
  for each row execute function public.on_event_invite();

create policy event_attendees_select on public.event_attendees for select to authenticated
  using (user_id = auth.uid() or public.can_view_event(event_id));
create policy event_attendees_insert on public.event_attendees for insert to authenticated
  with check (public.can_manage_event(event_id));
create policy event_attendees_update on public.event_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy event_attendees_delete on public.event_attendees for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_event(event_id));
