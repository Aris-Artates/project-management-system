-- Dev tools: feature flags (modules can be switched off for everyone or per
-- organization) and an audit entry type for impersonation.

create table public.feature_flags (
  key text primary key,
  label text not null,
  description text,
  enabled boolean not null default true,       -- platform-wide switch
  disabled_orgs uuid[] not null default '{}',  -- off for these organizations only
  position int not null default 0
);

insert into public.feature_flags (key, label, description, position) values
  ('chat', 'Project chat', 'Live team chat on each project', 0),
  ('docs', 'Docs', 'Wiki pages on each project', 1),
  ('bugs', 'Bug tracker', 'Bug reports on each project and in the client portal', 2),
  ('time', 'Time tracking', 'Timers, timesheets, workload and time reports', 3),
  ('invoices', 'Invoicing', 'Rates, budgets and invoices', 4),
  ('automation', 'Automation rules', 'Rules that react to task and bug changes', 5),
  ('integrations', 'Integrations and API', 'API keys, webhooks, Slack and GitHub', 6)
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
create policy feature_flags_select on public.feature_flags for select to authenticated using (true);
create policy feature_flags_write on public.feature_flags for update to authenticated
  using (public.is_platform_dev()) with check (public.is_platform_dev());

create or replace function public.feature_enabled(_org uuid, _key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled and not (_org = any (disabled_orgs)) from public.feature_flags where key = _key), true);
$$;

create trigger audit_feature_flags after update on public.feature_flags for each row execute function public.audit_row();
