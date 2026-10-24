-- bugs_select looked the row up by id, which fails for INSERT ... RETURNING
-- (the new row is not in the table yet). Check the row's own columns instead.
drop policy bugs_select on public.bugs;
create policy bugs_select on public.bugs for select to authenticated using (
  public.can_view_project(project_id) and (client_visible or not public.is_org_client(org_id))
);
