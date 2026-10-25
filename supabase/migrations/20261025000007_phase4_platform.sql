-- Phase 4 (part 2): webhooks and Slack, GitHub, public API keys, audit log,
-- calendar feeds and event reminders.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

-- Platform settings readable by database functions (e.g. the site URL for links).
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
create policy app_settings_admin on public.app_settings for all to authenticated
  using (public.is_platform_dev()) with check (public.is_platform_dev());

create or replace function public.site_url()
returns text language sql stable security definer set search_path = '' as $$
  select rtrim(value, '/') from public.app_settings where key = 'site_url';
$$;

-- ---------------------------------------------------------------------------
-- Webhooks (generic JSON or Slack incoming webhooks), delivered by pg_net
-- ---------------------------------------------------------------------------
create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'generic' check (kind in ('generic', 'slack')),
  url text not null check (
    url ~ '^https://[^/\s]+' and url !~* '^https://(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)'
  ),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  events text[] not null default '{*}',
  project_id uuid references public.projects (id) on delete cascade,
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  event text not null,
  request_id bigint,
  error text,
  created_at timestamptz not null default now()
);

create index webhook_deliveries_hook_idx on public.webhook_deliveries (webhook_id, created_at desc);

alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
create policy webhooks_manage on public.webhooks for all to authenticated
  using (public.has_org_perm(org_id, 'integration.manage')) with check (public.has_org_perm(org_id, 'integration.manage'));
create policy webhook_deliveries_select on public.webhook_deliveries for select to authenticated
  using (public.has_org_perm(org_id, 'integration.manage'));

create or replace function public.prepare_webhook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and not exists (select 1 from public.projects where id = new.project_id and org_id = new.org_id) then
    raise exception 'Project belongs to another organization';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

create trigger webhooks_prepare before insert or update on public.webhooks
  for each row execute function public.prepare_webhook();

-- Send an event to every matching webhook. Never fails the caller.
create or replace function public.emit_event(_org uuid, _project uuid, _event text, _summary text, _entity uuid, _actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _hook public.webhooks;
  _payload jsonb;
  _body text;
  _req bigint;
  _project_row public.projects;
  _slug text;
  _actor_name text;
  _link text;
begin
  if not exists (select 1 from public.webhooks where org_id = _org and enabled) then
    return;
  end if;
  select slug into _slug from public.organizations where id = _org;
  select * into _project_row from public.projects where id = _project;
  select coalesce(full_name, email) into _actor_name from public.profiles where id = _actor;
  _link := case when public.site_url() is not null and _project is not null
    then public.site_url() || '/' || _slug || '/projects/' || _project_row.key end;

  for _hook in
    select * from public.webhooks
    where org_id = _org and enabled
      and ('*' = any (events) or _event = any (events) or split_part(_event, '.', 1) || '.*' = any (events))
      and (project_id is null or project_id = _project)
  loop
    begin
      if _hook.kind = 'slack' then
        _payload := jsonb_build_object('text',
          coalesce('*' || _project_row.name || '*: ', '') || coalesce(_actor_name, 'Someone') || ' ' || _summary
          || coalesce(' <' || _link || '|Open>', ''));
      else
        _payload := jsonb_build_object(
          'event', _event,
          'organization', _slug,
          'project', case when _project is not null then jsonb_build_object('id', _project, 'key', _project_row.key, 'name', _project_row.name) end,
          'entity_id', _entity,
          'summary', _summary,
          'actor', _actor_name,
          'url', _link,
          'occurred_at', now()
        );
      end if;
      _body := _payload::text;
      select net.http_post(
        url := _hook.url,
        body := _payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Event', _event,
          'X-Signature', 'sha256=' || encode(extensions.hmac(_body, _hook.secret, 'sha256'), 'hex')
        ),
        timeout_milliseconds := 5000
      ) into _req;
      insert into public.webhook_deliveries (webhook_id, org_id, event, request_id) values (_hook.id, _org, _event, _req);
    exception when others then
      insert into public.webhook_deliveries (webhook_id, org_id, event, error) values (_hook.id, _org, _event, sqlerrm);
    end;
  end loop;
exception when others then
  -- Delivery problems must never block the user's action.
  return;
end;
$$;

revoke execute on function public.emit_event(uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- Every activity entry is also an event: "<entity>.<action>", e.g. task.created.
create or replace function public.log_activity(
  _org uuid, _project uuid, _action text, _type text, _entity uuid, _summary text, _client boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_log (org_id, project_id, actor_id, action, entity_type, entity_id, summary, client_visible)
  values (_org, _project, auth.uid(), _action, _type, _entity, _summary, _client);
  perform public.emit_event(_org, _project, _type || '.' || _action, _summary, _entity, auth.uid());
end;
$$;

revoke execute on function public.log_activity(uuid, uuid, text, text, uuid, text, boolean) from public, anon, authenticated;

-- Delivery log with HTTP results, for the integrations page.
create or replace function public.webhook_log(_webhook uuid)
returns table (event text, created_at timestamptz, status_code int, error text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.webhooks w where w.id = _webhook and public.has_org_perm(w.org_id, 'integration.manage')) then
    raise exception 'Not allowed';
  end if;
  return query
  select d.event, d.created_at, r.status_code, coalesce(d.error, r.error_msg)
  from public.webhook_deliveries d
  left join net._http_response r on r.id = d.request_id
  where d.webhook_id = _webhook
  order by d.created_at desc
  limit 20;
end;
$$;

-- ---------------------------------------------------------------------------
-- GitHub: link commits to tasks ("WEB-12") and close them ("fixes WEB-12")
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('github')),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, kind)
);

alter table public.integrations enable row level security;
create policy integrations_manage on public.integrations for all to authenticated
  using (public.has_org_perm(org_id, 'integration.manage')) with check (public.has_org_perm(org_id, 'integration.manage'));

-- Called by the public GitHub endpoint with the raw body; verifies the HMAC here.
create or replace function public.github_ingest(_org_slug text, _signature text, _event text, _body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid;
  _secret text;
  _commit jsonb;
  _ref text[];
  _task public.tasks;
  _linked int := 0;
  _closed int := 0;
  _done uuid;
  _msg text;
begin
  select o.id, i.secret into _org, _secret
  from public.organizations o join public.integrations i on i.org_id = o.id and i.kind = 'github' and i.enabled
  where o.slug = _org_slug and o.status = 'active';
  if _org is null then
    raise exception 'GitHub is not connected for this organization';
  end if;
  if _signature is distinct from 'sha256=' || encode(extensions.hmac(_body, _secret, 'sha256'), 'hex') then
    raise exception 'Invalid signature';
  end if;
  if _event = 'ping' then
    return jsonb_build_object('ok', true, 'pong', true);
  end if;
  if _event <> 'push' then
    return jsonb_build_object('ok', true, 'ignored', _event);
  end if;

  for _commit in select * from jsonb_array_elements(coalesce(_body::jsonb -> 'commits', '[]')) loop
    _msg := _commit ->> 'message';
    for _ref in select regexp_matches(_msg, '\m([A-Z][A-Z0-9]{1,5})-(\d+)\M', 'g') loop
      select t.* into _task from public.tasks t join public.projects p on p.id = t.project_id
      where p.org_id = _org and p.key = _ref[1] and t.number = _ref[2]::int;
      if found then
        insert into public.comments (project_id, task_id, body, is_internal)
        values (_task.project_id, _task.id,
          'Commit by ' || coalesce(_commit -> 'author' ->> 'name', 'someone') || ': ' || left(split_part(_msg, E'\n', 1), 300)
          || coalesce(E'\n' || (_commit ->> 'url'), ''), true);
        _linked := _linked + 1;
        if _msg ~* ('\m(fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+' || _ref[1] || '-' || _ref[2] || '\M')
           and _task.completed_at is null then
          select id into _done from public.task_statuses where project_id = _task.project_id and category = 'done' order by position limit 1;
          if _done is not null then
            update public.tasks set status_id = _done where id = _task.id;
            _closed := _closed + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'linked', _linked, 'closed', _closed);
end;
$$;

revoke execute on function public.github_ingest(text, text, text, text) from public;
grant execute on function public.github_ingest(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public API keys. Keys are shown once; only a SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{read}' check (scopes <@ '{read,write}' and cardinality(scopes) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.api_keys enable row level security;
create policy api_keys_select on public.api_keys for select to authenticated using (public.has_org_perm(org_id, 'integration.manage'));
create policy api_keys_revoke on public.api_keys for update to authenticated
  using (public.has_org_perm(org_id, 'integration.manage')) with check (public.has_org_perm(org_id, 'integration.manage'));

create or replace function public.create_api_key(_org uuid, _name text, _scopes text[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  _key text := 'pms_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.has_org_perm(_org, 'integration.manage') then
    raise exception 'Missing permission to manage integrations';
  end if;
  insert into public.api_keys (org_id, name, prefix, key_hash, scopes, created_by)
  values (_org, trim(_name), left(_key, 12), encode(extensions.digest(_key, 'sha256'), 'hex'), _scopes, auth.uid());
  return _key;
end;
$$;

create or replace function public.api_auth(_key text, _scope text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _k public.api_keys;
begin
  select * into _k from public.api_keys where key_hash = encode(extensions.digest(coalesce(_key, ''), 'sha256'), 'hex') and revoked_at is null;
  if not found then
    raise exception 'Invalid API key' using errcode = '28000';
  end if;
  if not (_scope = any (_k.scopes)) then
    raise exception 'This API key does not have % access', _scope using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations where id = _k.org_id and status = 'active') then
    raise exception 'Organization is suspended' using errcode = '42501';
  end if;
  if _k.last_used_at is null or _k.last_used_at < now() - interval '1 minute' then
    update public.api_keys set last_used_at = now() where id = _k.id;
  end if;
  return _k.org_id;
end;
$$;

revoke execute on function public.api_auth(text, text) from public, anon, authenticated;

create or replace function public.api_task_json(_t public.tasks)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.key || '-' || _t.number,
    'project', p.key,
    'number', _t.number,
    'title', _t.title,
    'description', _t.description,
    'status', s.name,
    'status_category', s.category,
    'priority', _t.priority,
    'start_date', _t.start_date,
    'due_date', _t.due_date,
    'estimate_hours', _t.estimate_hours,
    'client_visible', _t.client_visible,
    'parent', (select pp.key || '-' || pt.number from public.tasks pt join public.projects pp on pp.id = pt.project_id where pt.id = _t.parent_id),
    'assignees', (select coalesce(jsonb_agg(pr.email order by pr.email), '[]') from public.task_assignees a join public.profiles pr on pr.id = a.user_id where a.task_id = _t.id),
    'created_at', _t.created_at,
    'updated_at', _t.updated_at,
    'completed_at', _t.completed_at
  )
  from public.projects p left join public.task_statuses s on s.id = _t.status_id
  where p.id = _t.project_id;
$$;

revoke execute on function public.api_task_json(public.tasks) from public, anon, authenticated;

create or replace function public.api_projects(_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'read');
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'key', p.key, 'name', p.name, 'status', p.status, 'description', p.description,
      'start_date', p.start_date, 'end_date', p.end_date,
      'open_tasks', (select count(*) from public.tasks t where t.project_id = p.id and t.completed_at is null),
      'created_at', p.created_at
    ) order by p.name), '[]')
    from public.projects p where p.org_id = _org);
end;
$$;

create or replace function public.api_tasks(_key text, _project text, _state text, _limit int, _offset int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'read');
  _pid uuid;
begin
  select id into _pid from public.projects where org_id = _org and key = upper(_project);
  if _pid is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  return (select coalesce(jsonb_agg(public.api_task_json(t) order by t.number), '[]')
    from (
      select * from public.tasks t
      where t.project_id = _pid
        and (_state is null or _state = 'all' or (_state = 'open' and t.completed_at is null) or (_state = 'done' and t.completed_at is not null))
      order by t.number
      limit least(greatest(coalesce(_limit, 50), 1), 200) offset greatest(coalesce(_offset, 0), 0)
    ) t);
end;
$$;

create or replace function public.api_task(_key text, _project text, _number int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'read');
  _t public.tasks;
begin
  select t.* into _t from public.tasks t join public.projects p on p.id = t.project_id
  where p.org_id = _org and p.key = upper(_project) and t.number = _number;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  return public.api_task_json(_t);
end;
$$;

create or replace function public.api_create_task(_key text, _project text, _fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'write');
  _pid uuid;
  _t public.tasks;
  _status uuid;
begin
  select id into _pid from public.projects where org_id = _org and key = upper(_project);
  if _pid is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if coalesce(trim(_fields ->> 'title'), '') = '' then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if _fields ? 'status' then
    select id into _status from public.task_statuses where project_id = _pid and lower(name) = lower(_fields ->> 'status');
    if _status is null then
      raise exception 'Unknown status "%"', _fields ->> 'status' using errcode = '22023';
    end if;
  end if;
  insert into public.tasks (project_id, title, description, priority, start_date, due_date, estimate_hours, client_visible, status_id, position)
  values (_pid, left(_fields ->> 'title', 300), _fields ->> 'description', coalesce(_fields ->> 'priority', 'none'),
    (_fields ->> 'start_date')::date, (_fields ->> 'due_date')::date, (_fields ->> 'estimate_hours')::numeric,
    coalesce((_fields ->> 'client_visible')::boolean, false), _status, extract(epoch from clock_timestamp()))
  returning * into _t;
  return public.api_task_json(_t);
end;
$$;

create or replace function public.api_update_task(_key text, _project text, _number int, _fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'write');
  _t public.tasks;
  _status uuid;
begin
  select t.* into _t from public.tasks t join public.projects p on p.id = t.project_id
  where p.org_id = _org and p.key = upper(_project) and t.number = _number;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if _fields ? 'status' then
    select id into _status from public.task_statuses where project_id = _t.project_id and lower(name) = lower(_fields ->> 'status');
    if _status is null then
      raise exception 'Unknown status "%"', _fields ->> 'status' using errcode = '22023';
    end if;
  end if;
  update public.tasks set
    title = case when _fields ? 'title' then left(_fields ->> 'title', 300) else title end,
    description = case when _fields ? 'description' then _fields ->> 'description' else description end,
    priority = case when _fields ? 'priority' then _fields ->> 'priority' else priority end,
    start_date = case when _fields ? 'start_date' then (_fields ->> 'start_date')::date else start_date end,
    due_date = case when _fields ? 'due_date' then (_fields ->> 'due_date')::date else due_date end,
    estimate_hours = case when _fields ? 'estimate_hours' then (_fields ->> 'estimate_hours')::numeric else estimate_hours end,
    client_visible = case when _fields ? 'client_visible' then (_fields ->> 'client_visible')::boolean else client_visible end,
    status_id = coalesce(_status, status_id)
  where id = _t.id
  returning * into _t;
  return public.api_task_json(_t);
end;
$$;

create or replace function public.api_time_entries(_key text, _from date, _to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _org uuid := public.api_auth(_key, 'read');
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'date', e.work_date, 'minutes', e.minutes, 'billable', e.billable, 'status', e.status, 'note', e.note,
      'person', pr.email, 'project', p.key,
      'task', case when t.id is not null then p.key || '-' || t.number end
    ) order by e.work_date, e.created_at), '[]')
    from public.time_entries e
    join public.projects p on p.id = e.project_id
    join public.profiles pr on pr.id = e.user_id
    left join public.tasks t on t.id = e.task_id
    where e.org_id = _org and e.work_date between coalesce(_from, current_date - 30) and coalesce(_to, current_date));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'api_projects(text)', 'api_tasks(text, text, text, integer, integer)', 'api_task(text, text, integer)',
    'api_create_task(text, text, jsonb)', 'api_update_task(text, text, integer, jsonb)', 'api_time_entries(text, date, date)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log: who changed access, settings and integrations
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade, -- null = platform level
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  target_label text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (org_id, created_at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated using (
  public.is_platform_admin() or (org_id is not null and public.has_org_perm(org_id, 'audit.view'))
);

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  _new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  _row jsonb := coalesce(_new, _old);
  _org uuid;
  _changes jsonb;
  _label text;
  _hidden text[] := array['key_hash', 'secret', 'updated_at', 'invoice_seq', 'task_seq', 'bug_seq', 'last_used_at', 'created_at'];
begin
  _org := case tg_table_name
    when 'organizations' then (_row ->> 'id')::uuid
    when 'profiles' then null
    else (_row ->> 'org_id')::uuid end;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, jsonb_build_object('from', o.value, 'to', n.value)) into _changes
    from jsonb_each(_old) o join jsonb_each(_new) n using (key)
    where o.value is distinct from n.value and not (o.key = any (_hidden));
    if _changes is null then
      return null;
    end if;
  else
    select jsonb_object_agg(key, value) into _changes from jsonb_each(_row) where not (key = any (_hidden));
  end if;
  _label := coalesce(_row ->> 'name', _row ->> 'email', _row ->> 'title', _row ->> 'key');
  if tg_table_name in ('org_members', 'profiles') then
    select coalesce(full_name, email) into _label from public.profiles where id = coalesce((_row ->> 'user_id')::uuid, (_row ->> 'id')::uuid);
  end if;
  if tg_table_name = 'profiles' and not (_changes ? 'platform_role') then
    return null;
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, target_label, details)
  values (_org, auth.uid(), lower(tg_op), tg_table_name, coalesce(_row ->> 'id', _row ->> 'user_id'), _label, coalesce(_changes, '{}'));
  return null;
exception when foreign_key_violation then
  -- The organization itself is being deleted.
  return null;
end;
$$;

create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.audit_row();
create trigger audit_org_members after insert or update or delete on public.org_members for each row execute function public.audit_row();
create trigger audit_invitations after insert or delete on public.invitations for each row execute function public.audit_row();
create trigger audit_organizations after update on public.organizations for each row execute function public.audit_row();
create trigger audit_projects after delete on public.projects for each row execute function public.audit_row();
create trigger audit_api_keys after insert or update on public.api_keys for each row execute function public.audit_row();
create trigger audit_webhooks after insert or update or delete on public.webhooks for each row execute function public.audit_row();
create trigger audit_integrations after insert or update or delete on public.integrations for each row execute function public.audit_row();
create trigger audit_automation after insert or update or delete on public.automation_rules for each row execute function public.audit_row();
create trigger audit_profiles after update of platform_role on public.profiles for each row execute function public.audit_row();
create trigger audit_member_rates after insert or update or delete on public.member_rates for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Private calendar feeds (iCal) and event reminders
-- ---------------------------------------------------------------------------
create table public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(20), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_own on public.calendar_feeds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Events you attend plus tasks assigned to you, for the feed URL.
create or replace function public.calendar_feed(_token text)
returns table (uid text, title text, starts_at timestamptz, ends_at timestamptz, all_day boolean, location text, description text, url text)
language plpgsql stable security definer set search_path = '' as $$
declare
  _user uuid;
  _base text := public.site_url();
begin
  select user_id into _user from public.calendar_feeds where token = _token;
  if _user is null then
    raise exception 'Unknown feed' using errcode = 'P0002';
  end if;
  return query
  select 'event-' || e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.location, e.description,
    _base || '/go/event/' || e.id
  from public.events e
  join public.event_attendees a on a.event_id = e.id and a.user_id = _user and a.response <> 'no'
  join public.org_members m on m.org_id = e.org_id and m.user_id = _user and m.status = 'active'
  join public.organizations o on o.id = e.org_id and o.status = 'active'
  where e.ends_at > now() - interval '60 days'
  union all
  select 'task-' || t.id, p.key || '-' || t.number || ' ' || t.title, t.due_date::timestamptz, t.due_date::timestamptz, true, null, null,
    _base || '/go/task/' || t.id
  from public.tasks t
  join public.task_assignees a on a.task_id = t.id and a.user_id = _user
  join public.projects p on p.id = t.project_id
  join public.org_members m on m.org_id = t.org_id and m.user_id = _user and m.status = 'active'
  where t.due_date is not null and t.completed_at is null;
end;
$$;

revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

create table public.event_reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('1d', '1h')),
  primary key (event_id, user_id, kind)
);

alter table public.event_reminders_sent enable row level security;

create or replace function public.send_event_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  _sent int := 0;
  _r record;
begin
  for _r in
    select e.id, e.org_id, e.title, e.starts_at, a.user_id,
      case when e.starts_at <= now() + interval '1 hour' then '1h' else '1d' end as kind
    from public.events e
    join public.event_attendees a on a.event_id = e.id and a.response <> 'no'
    where e.starts_at > now() and e.starts_at <= now() + interval '24 hours' and not e.all_day
  loop
    insert into public.event_reminders_sent (event_id, user_id, kind) values (_r.id, _r.user_id, _r.kind)
    on conflict do nothing;
    if found then
      insert into public.notifications (user_id, org_id, type, title, body, link)
      values (_r.user_id, _r.org_id, 'event.reminder',
        case _r.kind when '1h' then 'Starting soon: ' else 'Tomorrow: ' end || _r.title,
        null, '/go/event/' || _r.id);
      _sent := _sent + 1;
    end if;
  end loop;
  return _sent;
end;
$$;

revoke execute on function public.send_event_reminders() from public, anon, authenticated;

select cron.schedule('event-reminders', '*/10 * * * *', 'select public.send_event_reminders()');
