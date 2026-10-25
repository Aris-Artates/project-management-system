-- task_ref / task_link / bug_ref were STABLE. A STABLE function sees the
-- snapshot of the outermost statement, so when a trigger cascade creates a
-- task and then assigns it (automation, recurring tasks), the reference came
-- back null and the assignment notification failed. Make them VOLATILE.

create or replace function public.task_ref(_task uuid)
returns text language sql volatile security definer set search_path = '' as $$
  select p.key || '-' || t.number || ' ' || t.title
  from public.tasks t join public.projects p on p.id = t.project_id
  where t.id = _task and (auth.uid() is null or public.can_view_task(t.id));
$$;

create or replace function public.task_link(_task uuid)
returns text language sql volatile security definer set search_path = '' as $$
  select '/go/task/' || t.id
  from public.tasks t
  where t.id = _task and (auth.uid() is null or public.can_view_task(t.id));
$$;

create or replace function public.bug_ref(_bug uuid)
returns text language sql volatile security definer set search_path = '' as $$
  select p.key || '-B' || b.number || ' ' || b.title
  from public.bugs b join public.projects p on p.id = b.project_id
  where b.id = _bug and (auth.uid() is null or public.can_view_bug(b.id));
$$;

-- A notification must never block the action that caused it.
create or replace function public.notify(
  _user uuid, _org uuid, _type text, _title text, _body text, _link text
) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, org_id, type, title, body, link)
  select _user, _org, _type, coalesce(nullif(_title, ''), 'Update'), _body, _link
  where _user is not null and _user is distinct from auth.uid();
$$;

revoke execute on function public.notify(uuid, uuid, text, text, text, text) from public, anon, authenticated;
