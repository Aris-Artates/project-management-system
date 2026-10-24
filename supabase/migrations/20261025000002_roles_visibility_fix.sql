-- The previous policy read project_members under RLS, whose policy reads roles:
-- infinite recursion. Do the lookup in a security definer helper instead.
create or replace function public.can_see_role(_role uuid, _org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_staff(_org)
    or exists (
      select 1 from public.org_members m
      where m.org_id = _org and m.user_id = auth.uid() and m.role_id = _role
    )
    or exists (
      select 1 from public.project_members pm
      where pm.org_id = _org and pm.user_id = auth.uid() and pm.role_override_id = _role
    );
$$;

drop policy roles_select on public.roles;

create policy roles_select on public.roles for select to authenticated using (public.can_see_role(id, org_id));
