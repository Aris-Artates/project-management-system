-- Rule run counters are not worth auditing.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  _new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  _row jsonb := coalesce(_new, _old);
  _org uuid;
  _changes jsonb;
  _label text;
  _hidden text[] := array['key_hash', 'secret', 'updated_at', 'invoice_seq', 'task_seq', 'bug_seq', 'last_used_at', 'created_at', 'run_count', 'last_run_at'];
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

