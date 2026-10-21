-- Tenancy: profiles, organizations, roles, permissions, members, invitations.
-- Access rules live in the helper functions below; every policy goes through them.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  platform_role text check (platform_role in ('dev', 'super_admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  logo_url text,
  plan text not null default 'free',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission catalog: the master list the role builder renders from.
-- Scope 'org' keys are checked against the org role only; 'project' keys can be
-- overridden per project.
-- ---------------------------------------------------------------------------
create table public.permission_catalog (
  key text primary key,
  module text not null,
  label text not null,
  description text,
  scope text not null check (scope in ('org', 'project')),
  client_safe boolean not null default false,
  sort int not null default 0
);

insert into public.permission_catalog (key, module, label, description, scope, client_safe, sort) values
  ('org.settings',           'Organization', 'Manage settings',        'Edit organization name, logo and preferences', 'org', false, 10),
  ('member.invite',          'Organization', 'Invite members',         'Send invitations to team members',             'org', false, 11),
  ('member.manage',          'Organization', 'Manage members',         'Change roles and deactivate members',          'org', false, 12),
  ('role.manage',            'Organization', 'Manage roles and access','Create, edit and delete roles',                'org', false, 13),
  ('client.invite',          'Organization', 'Invite clients',         'Invite client contacts to projects',           'org', false, 14),
  ('project.view_all',       'Projects',     'View all projects',      'See every project, not only assigned ones',    'org', false, 20),
  ('project.create',         'Projects',     'Create projects',        null,                                           'org', false, 21),
  ('project.edit',           'Projects',     'Edit projects',          'Edit details, lists, statuses and tags',       'project', false, 22),
  ('project.delete',         'Projects',     'Delete projects',        null,                                           'project', false, 23),
  ('project.manage_members', 'Projects',     'Manage project members', 'Add or remove people and clients',             'project', false, 24),
  ('task.create',            'Tasks',        'Create tasks',           'Clients create requests visible to them',      'project', true,  30),
  ('task.edit',              'Tasks',        'Edit any task',          null,                                           'project', false, 31),
  ('task.edit_own',          'Tasks',        'Edit own tasks',         'Tasks they created or are assigned to',        'project', false, 32),
  ('task.assign',            'Tasks',        'Assign tasks',           null,                                           'project', false, 33),
  ('task.delete',            'Tasks',        'Delete tasks',           null,                                           'project', false, 34),
  ('milestone.manage',       'Milestones',   'Manage milestones',      null,                                           'project', false, 40),
  ('comment.create',         'Comments',     'Write comments',         null,                                           'project', true,  50),
  ('comment.delete_any',     'Comments',     'Delete any comment',     null,                                           'project', false, 51),
  ('file.upload',            'Files',        'Upload files',           null,                                           'project', true,  60),
  ('file.delete_any',        'Files',        'Delete any file',        null,                                           'project', false, 61);

-- ---------------------------------------------------------------------------
-- Roles. Only org_admin and client are preset (system_key); all others are
-- created by the organization.
-- ---------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  description text,
  color text not null default '#6366f1',
  position int not null default 100,
  system_key text check (system_key in ('org_admin', 'client')),
  permissions text[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

create unique index roles_one_system_key_per_org on public.roles (org_id, system_key)
  where system_key is not null;

-- ---------------------------------------------------------------------------
-- Members and invitations
-- ---------------------------------------------------------------------------
create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (role_id, org_id) references public.roles (id, org_id) on delete restrict
);

create index org_members_user_idx on public.org_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role_id uuid not null,
  project_ids uuid[] not null default '{}',
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (role_id, org_id) references public.roles (id, org_id) on delete cascade
);

create index invitations_org_idx on public.invitations (org_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read past RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_dev()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'dev'
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role in ('dev', 'super_admin')
  );
$$;

-- The caller's active role in an active org (null when none).
create or replace function public.my_org_role(_org uuid)
returns public.roles language sql stable security definer set search_path = '' as $$
  select r.*
  from public.org_members m
  join public.organizations o on o.id = m.org_id and o.status = 'active'
  join public.roles r on r.id = m.role_id
  where m.org_id = _org and m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or (public.my_org_role(_org)).id is not null;
$$;

-- Staff = any member who is not a client.
create or replace function public.is_org_staff(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.my_org_role(_org) r
    where r.id is not null and r.system_key is distinct from 'client'
  );
$$;

create or replace function public.is_org_client(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_platform_admin() and exists (
    select 1 from public.my_org_role(_org) r where r.system_key = 'client'
  );
$$;

create or replace function public.has_org_perm(_org uuid, _perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.my_org_role(_org) r
    where r.id is not null and (r.system_key = 'org_admin' or _perm = any (r.permissions))
  );
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Org status and plan are platform decisions.
create or replace function public.guard_organization_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.status is distinct from old.status or new.plan is distinct from old.plan)
     and not public.is_platform_admin() then
    raise exception 'Only platform admins can change organization status or plan';
  end if;
  if new.slug is distinct from old.slug and not public.is_platform_admin() then
    raise exception 'Only platform admins can change the organization URL';
  end if;
  return new;
end;
$$;

create trigger organizations_guard before update on public.organizations
  for each row execute function public.guard_organization_update();

create or replace function public.guard_role_change()
returns trigger language plpgsql set search_path = '' as $$
declare
  _unknown text[];
  _unsafe text[];
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null and current_setting('app.allow_system_role_delete', true) is distinct from 'on'
       and exists (select 1 from public.organizations where id = old.org_id) then
      raise exception 'Preset roles cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.system_key is distinct from old.system_key or new.org_id is distinct from old.org_id then
      raise exception 'Role type and organization cannot be changed';
    end if;
    if old.system_key is not null and new.name is distinct from old.name then
      raise exception 'Preset roles cannot be renamed';
    end if;
  elsif new.system_key is not null and current_setting('app.creating_org', true) is distinct from 'on' then
    raise exception 'Preset roles are created with the organization';
  end if;

  new.permissions := coalesce(array(select distinct unnest(new.permissions) order by 1), '{}');

  select coalesce(array_agg(p), '{}') into _unknown
  from unnest(new.permissions) p
  where not exists (select 1 from public.permission_catalog c where c.key = p);
  if cardinality(_unknown) > 0 then
    raise exception 'Unknown permissions: %', array_to_string(_unknown, ', ');
  end if;

  if new.system_key = 'org_admin' then
    -- Org Admin always has everything; the list is not used.
    new.permissions := '{}';
  elsif new.system_key = 'client' then
    select coalesce(array_agg(p), '{}') into _unsafe
    from unnest(new.permissions) p
    join public.permission_catalog c on c.key = p
    where not c.client_safe;
    if cardinality(_unsafe) > 0 then
      raise exception 'Clients cannot be given: %', array_to_string(_unsafe, ', ');
    end if;
  end if;

  return new;
end;
$$;

create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function public.guard_role_change();

-- Keep at least one active Org Admin and stop non-admins handing out the admin role.
create or replace function public.guard_member_change()
returns trigger language plpgsql set search_path = '' as $$
declare
  _org uuid;
  _admin_role uuid;
  _remaining int;
  _grants_admin boolean := false;
  _drops_admin boolean := false;
begin
  _org := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  select id into _admin_role from public.roles where org_id = _org and system_key = 'org_admin';

  if tg_op = 'INSERT' then
    _grants_admin := new.role_id = _admin_role;
  elsif tg_op = 'UPDATE' then
    _grants_admin := new.role_id = _admin_role and old.role_id <> _admin_role;
    _drops_admin := old.role_id = _admin_role and old.status = 'active'
      and (new.role_id <> _admin_role or new.status <> 'active');
  else
    _drops_admin := old.role_id = _admin_role and old.status = 'active';
  end if;

  if _grants_admin
     and current_setting('app.creating_org', true) is distinct from 'on'
     and current_setting('app.accepting_invite', true) is distinct from 'on'
     and not public.is_platform_admin()
     and coalesce((public.my_org_role(_org)).system_key, '') <> 'org_admin' then
    raise exception 'Only an Org Admin can grant the Org Admin role';
  end if;

  if _drops_admin and current_setting('app.deleting_org', true) is distinct from 'on' then
    select count(*) into _remaining from public.org_members
    where org_id = _org and role_id = _admin_role and status = 'active' and user_id <> old.user_id;
    if _remaining = 0 then
      raise exception 'An organization needs at least one active Org Admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger org_members_guard before insert or update or delete on public.org_members
  for each row execute function public.guard_member_change();

-- Non-admins with invite rights cannot invite into the Org Admin role, and
-- client.invite alone only allows client invites.
create or replace function public.guard_invitation()
returns trigger language plpgsql set search_path = '' as $$
declare
  _key text;
begin
  new.email := lower(trim(new.email));
  new.invited_by := coalesce(auth.uid(), new.invited_by);
  select system_key into _key from public.roles where id = new.role_id;
  if public.is_platform_admin() or coalesce((public.my_org_role(new.org_id)).system_key, '') = 'org_admin' then
    return new;
  end if;
  if _key = 'org_admin' then
    raise exception 'Only an Org Admin can invite another Org Admin';
  end if;
  if _key = 'client' and not public.has_org_perm(new.org_id, 'client.invite') then
    raise exception 'Missing permission to invite clients';
  end if;
  if _key is distinct from 'client' and not public.has_org_perm(new.org_id, 'member.invite') then
    raise exception 'Missing permission to invite members';
  end if;
  return new;
end;
$$;

create trigger invitations_guard before insert on public.invitations
  for each row execute function public.guard_invitation();

-- Profiles: only display fields are self-editable.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Internal: create org + preset roles. Returns the org id.
create or replace function public._create_org_with_roles(_name text, _slug text, _creator uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _org uuid;
begin
  perform set_config('app.creating_org', 'on', true);
  insert into public.organizations (name, slug, created_by)
  values (trim(_name), lower(trim(_slug)), _creator)
  returning id into _org;

  insert into public.roles (org_id, name, description, color, position, system_key, permissions)
  values
    (_org, 'Org Admin', 'Full control of this organization', '#0f766e', 0, 'org_admin', '{}'),
    (_org, 'Client', 'External contact who sees only invited projects', '#b45309', 1000, 'client', '{comment.create}');
  return _org;
end;
$$;

revoke execute on function public._create_org_with_roles(text, text, uuid) from public, anon, authenticated;

-- Any signed-in user can start an organization and becomes its Org Admin.
create or replace function public.create_organization(_name text, _slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _org uuid;
  _admin uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  _org := public._create_org_with_roles(_name, _slug, auth.uid());
  select id into _admin from public.roles where org_id = _org and system_key = 'org_admin';
  insert into public.org_members (org_id, user_id, role_id) values (_org, auth.uid(), _admin);
  perform set_config('app.creating_org', 'off', true);
  return _org;
end;
$$;

-- Platform: create an org for someone else and invite its first Org Admin.
-- Returns the invitation token so the app can email it.
create or replace function public.admin_create_organization(_name text, _slug text, _admin_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  _org uuid;
  _admin uuid;
  _token text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only';
  end if;
  _org := public._create_org_with_roles(_name, _slug, auth.uid());
  perform set_config('app.creating_org', 'off', true);
  select id into _admin from public.roles where org_id = _org and system_key = 'org_admin';
  insert into public.invitations (org_id, email, role_id)
  values (_org, lower(trim(_admin_email)), _admin)
  returning token into _token;
  return _token;
end;
$$;

create or replace function public.admin_set_org_status(_org uuid, _status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only';
  end if;
  update public.organizations set status = _status where id = _org;
end;
$$;

create or replace function public.admin_delete_organization(_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only';
  end if;
  perform set_config('app.deleting_org', 'on', true);
  perform set_config('app.allow_system_role_delete', 'on', true);
  delete from public.org_members where org_id = _org;
  delete from public.organizations where id = _org;
end;
$$;

-- Dev only: grant or remove platform roles. Super Admins cannot create Devs.
create or replace function public.admin_set_platform_role(_user uuid, _role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_dev() then
    raise exception 'Devs only';
  end if;
  if _user = auth.uid() and _role is distinct from 'dev' then
    raise exception 'You cannot remove your own Dev role';
  end if;
  update public.profiles set platform_role = _role where id = _user;
end;
$$;

-- Public lookup used by the invite landing page (before sign-in).
create or replace function public.get_invitation(_token text)
returns table (org_name text, org_slug text, email text, role_name text, is_client boolean, expired boolean, accepted boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, o.slug, i.email, r.name, r.system_key = 'client',
         i.expires_at < now(), i.accepted_at is not null
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  join public.roles r on r.id = i.role_id
  where i.token = _token;
$$;

grant execute on function public.get_invitation(text) to anon, authenticated;

-- Project membership table is created in the next migration; accept_invitation
-- is defined there so it can add project members too.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.roles enable row level security;
alter table public.org_members enable row level security;
alter table public.invitations enable row level security;

-- Profiles: yourself, anyone sharing an org with you, or platform admins.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1 from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_platform_admin() or exists (
    select 1 from public.org_members m where m.org_id = organizations.id and m.user_id = auth.uid()
  ));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_perm(id, 'org.settings')) with check (public.has_org_perm(id, 'org.settings'));

create policy permission_catalog_select on public.permission_catalog for select to authenticated using (true);

create policy roles_select on public.roles for select to authenticated using (public.is_org_member(org_id));
create policy roles_insert on public.roles for insert to authenticated with check (public.has_org_perm(org_id, 'role.manage'));
create policy roles_update on public.roles for update to authenticated
  using (public.has_org_perm(org_id, 'role.manage')) with check (public.has_org_perm(org_id, 'role.manage'));
create policy roles_delete on public.roles for delete to authenticated using (public.has_org_perm(org_id, 'role.manage'));

-- Staff see the whole member list; clients see themselves (project-level
-- co-members are exposed through project_members).
create policy org_members_select on public.org_members for select to authenticated using (
  user_id = auth.uid() or public.is_org_staff(org_id)
);
create policy org_members_update on public.org_members for update to authenticated
  using (public.has_org_perm(org_id, 'member.manage')) with check (public.has_org_perm(org_id, 'member.manage'));
create policy org_members_delete on public.org_members for delete to authenticated using (
  public.has_org_perm(org_id, 'member.manage')
);

create policy invitations_select on public.invitations for select to authenticated using (
  public.has_org_perm(org_id, 'member.invite') or public.has_org_perm(org_id, 'client.invite')
);
create policy invitations_insert on public.invitations for insert to authenticated with check (
  public.has_org_perm(org_id, 'member.invite') or public.has_org_perm(org_id, 'client.invite')
);
create policy invitations_delete on public.invitations for delete to authenticated using (
  public.has_org_perm(org_id, 'member.invite') or public.has_org_perm(org_id, 'client.invite')
);
