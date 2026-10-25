-- Switched-off modules are also off outside the app: API keys, webhooks and
-- automation rules respect the feature flags.

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
  if not public.feature_enabled(_k.org_id, 'integrations') then
    raise exception 'The API is turned off for this organization' using errcode = '42501';
  end if;
  if _k.last_used_at is null or _k.last_used_at < now() - interval '1 minute' then
    update public.api_keys set last_used_at = now() where id = _k.id;
  end if;
  return _k.org_id;
end;
$$;

revoke execute on function public.api_auth(text, text) from public, anon, authenticated;

create or replace function public.run_task_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _rule public.automation_rules;
  _event text;
  _category text;
  _act jsonb;
  _target uuid;
  _msg text;
begin
  -- Changes made by a rule do not trigger more rules.
  if current_setting('app.in_automation', true) = 'on' then
    return null;
  end if;
  -- Module switched off for this organization.
  if not public.feature_enabled(new.org_id, 'automation') then
    return null;
  end if;
  select category into _category from public.task_statuses where id = new.status_id;

  for _event in
    select e from unnest(array[
      case when tg_op = 'INSERT' then 'task.created' end,
      case when tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then 'task.status_changed' end,
      case when tg_op = 'UPDATE' and new.completed_at is not null and old.completed_at is null then 'task.completed' end
    ]) e where e is not null
  loop
    for _rule in
      select * from public.automation_rules r
      where r.enabled and r.org_id = new.org_id and r.trigger = _event
        and (r.project_id is null or r.project_id = new.project_id)
        and public.automation_matches(r.conditions, new.status_id, _category, new.priority, new.list_id, null, null)
    loop
      begin
        perform set_config('app.in_automation', 'on', true);
        for _act in select * from jsonb_array_elements(_rule.actions) loop
          case _act ->> 'type'
            when 'assign' then
              insert into public.task_assignees (task_id, user_id) values (new.id, (_act ->> 'user_id')::uuid) on conflict do nothing;
            when 'set_priority' then
              update public.tasks set priority = _act ->> 'priority' where id = new.id;
            when 'set_status' then
              update public.tasks set status_id = (_act ->> 'status_id')::uuid where id = new.id;
            when 'move_to_list' then
              update public.tasks set list_id = (_act ->> 'list_id')::uuid where id = new.id;
            when 'share_with_client' then
              update public.tasks set client_visible = true where id = new.id;
            when 'comment' then
              insert into public.comments (project_id, task_id, body, author_id, is_internal)
              values (new.project_id, new.id, left(_act ->> 'body', 2000), null, coalesce((_act ->> 'internal')::boolean, true));
            when 'notify' then
              for _target in
                select case _act ->> 'who'
                  when 'creator' then new.created_by
                  when 'user' then (_act ->> 'user_id')::uuid
                  else null end
                union select a.user_id from public.task_assignees a where a.task_id = new.id and _act ->> 'who' = 'assignees'
              loop
                if _target is not null then
                  insert into public.notifications (user_id, org_id, type, title, body, link)
                  values (_target, new.org_id, 'automation', coalesce(_act ->> 'message', _rule.name), public.task_ref(new.id), '/go/task/' || new.id);
                end if;
              end loop;
            else
              raise exception 'Unknown action %', _act ->> 'type';
          end case;
        end loop;
        perform set_config('app.in_automation', 'off', true);
        update public.automation_rules set run_count = run_count + 1, last_run_at = now() where id = _rule.id;
        insert into public.automation_runs (rule_id, org_id, entity_id, ok, message) values (_rule.id, _rule.org_id, new.id, true, _event);
      exception when others then
        perform set_config('app.in_automation', 'off', true);
        get stacked diagnostics _msg = message_text;
        insert into public.automation_runs (rule_id, org_id, entity_id, ok, message) values (_rule.id, _rule.org_id, new.id, false, _msg);
      end;
    end loop;
  end loop;
  return null;
end;
$$;

create or replace function public.run_bug_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _rule public.automation_rules;
  _event text;
  _act jsonb;
  _msg text;
  _target uuid;
begin
  if current_setting('app.in_automation', true) = 'on' then
    return null;
  end if;
  -- Module switched off for this organization.
  if not public.feature_enabled(new.org_id, 'automation') then
    return null;
  end if;
  _event := case
    when tg_op = 'INSERT' then 'bug.created'
    when new.status is distinct from old.status then 'bug.status_changed'
  end;
  if _event is null then
    return null;
  end if;
  for _rule in
    select * from public.automation_rules r
    where r.enabled and r.org_id = new.org_id and r.trigger = _event
      and (r.project_id is null or r.project_id = new.project_id)
      and public.automation_matches(r.conditions, null, null, null, null, new.severity, new.status)
  loop
    begin
      perform set_config('app.in_automation', 'on', true);
      for _act in select * from jsonb_array_elements(_rule.actions) loop
        case _act ->> 'type'
          when 'assign' then
            update public.bugs set assignee_id = (_act ->> 'user_id')::uuid where id = new.id;
          when 'set_bug_status' then
            update public.bugs set status = _act ->> 'status' where id = new.id;
          when 'share_with_client' then
            update public.bugs set client_visible = true where id = new.id;
          when 'comment' then
            insert into public.comments (project_id, bug_id, body, author_id, is_internal)
            values (new.project_id, new.id, left(_act ->> 'body', 2000), null, coalesce((_act ->> 'internal')::boolean, true));
          when 'notify' then
            _target := case _act ->> 'who'
              when 'reporter' then new.reporter_id
              when 'assignees' then new.assignee_id
              when 'user' then (_act ->> 'user_id')::uuid
            end;
            if _target is not null then
              insert into public.notifications (user_id, org_id, type, title, body, link)
              values (_target, new.org_id, 'automation', coalesce(_act ->> 'message', _rule.name), public.bug_ref(new.id), '/go/bug/' || new.id);
            end if;
          else
            raise exception 'Unknown action %', _act ->> 'type';
        end case;
      end loop;
      perform set_config('app.in_automation', 'off', true);
      update public.automation_rules set run_count = run_count + 1, last_run_at = now() where id = _rule.id;
      insert into public.automation_runs (rule_id, org_id, entity_id, ok, message) values (_rule.id, _rule.org_id, new.id, true, _event);
    exception when others then
      perform set_config('app.in_automation', 'off', true);
      get stacked diagnostics _msg = message_text;
      insert into public.automation_runs (rule_id, org_id, entity_id, ok, message) values (_rule.id, _rule.org_id, new.id, false, _msg);
    end;
  end loop;
  return null;
end;
$$;

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
  if not public.feature_enabled(_org, 'integrations') then
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
