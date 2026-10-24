-- Clients only need their own role; the rest of the org's roles stay with staff.
drop policy roles_select on public.roles;

create policy roles_select on public.roles for select to authenticated using (
  public.is_org_staff(org_id)
  or exists (
    select 1 from public.org_members m
    where m.org_id = roles.org_id and m.user_id = auth.uid() and m.role_id = roles.id
  )
  or exists (
    select 1 from public.project_members pm
    where pm.org_id = roles.org_id and pm.user_id = auth.uid() and pm.role_override_id = roles.id
  )
);
