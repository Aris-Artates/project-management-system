-- Phase 4 (part 1): plans and limits, rates, budgets, invoices, automation rules.

insert into public.permission_catalog (key, module, label, description, scope, client_safe, sort) values
  ('billing.manage',    'Organization', 'Manage plan and billing',   'Change the subscription plan',                 'org',     false, 16),
  ('audit.view',        'Organization', 'View audit log',            'See who changed access and settings',          'org',     false, 17),
  ('integration.manage','Organization', 'Manage integrations',       'API keys, webhooks, Slack and GitHub',         'org',     false, 18),
  ('automation.manage', 'Organization', 'Manage automation rules',   null,                                           'org',     false, 19),
  ('invoice.manage',    'Billing',      'Manage invoices and rates', 'Create, send and mark invoices paid',          'org',     false, 110),
  ('budget.view',       'Billing',      'See budgets and costs',     'Project budgets, rates and cost reports',      'project', false, 111)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Plans and limits
-- ---------------------------------------------------------------------------
create table public.plans (
  key text primary key,
  name text not null,
  max_members int,           -- null = unlimited
  max_projects int,
  max_storage_mb int,
  price_monthly numeric(10, 2) not null default 0,
  position int not null default 0
);

insert into public.plans (key, name, max_members, max_projects, max_storage_mb, price_monthly, position) values
  ('free', 'Free', 5, 3, 500, 0, 0),
  ('team', 'Team', 25, 50, 20480, 49, 1),
  ('business', 'Business', null, null, 204800, 199, 2)
on conflict (key) do nothing;

alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);

alter table public.organizations
  add constraint organizations_plan_fkey foreign key (plan) references public.plans (key),
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
  add column invoice_seq int not null default 0,
  add column tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  add column payment_terms_days int not null default 14 check (payment_terms_days between 0 and 365),
  add column billing_address text,
  add column require_mfa boolean not null default false,
  add column sso_domain text check (sso_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text,
  add column current_period_end timestamptz;

-- Billing columns are written by the billing webhook (service role) or platform admins.
create or replace function public.guard_organization_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.status is distinct from old.status
      or new.plan is distinct from old.plan
      or new.slug is distinct from old.slug
      or new.stripe_customer_id is distinct from old.stripe_customer_id
      or new.stripe_subscription_id is distinct from old.stripe_subscription_id
      or new.subscription_status is distinct from old.subscription_status
      or new.current_period_end is distinct from old.current_period_end
      or new.invoice_seq < old.invoice_seq)
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Only platform admins can change organization status, plan or URL';
  end if;
  return new;
end;
$$;

create or replace function public.plan_limit(_org uuid, _what text)
returns int language sql stable security definer set search_path = '' as $$
  select case _what
    when 'members' then p.max_members
    when 'projects' then p.max_projects
    when 'storage' then p.max_storage_mb
  end
  from public.organizations o join public.plans p on p.key = o.plan
  where o.id = _org;
$$;

create or replace function public.enforce_plan_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _limit int;
  _used bigint;
begin
  if current_setting('app.skip_plan_limits', true) = 'on' then
    return new;
  end if;
  if tg_table_name = 'org_members' then
    if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
      return new;
    end if;
    _limit := public.plan_limit(new.org_id, 'members');
    select count(*) into _used from public.org_members where org_id = new.org_id and status = 'active';
    if _limit is not null and _used >= _limit then
      raise exception 'Your plan allows % active members. Upgrade to add more.', _limit;
    end if;
  elsif tg_table_name = 'projects' then
    _limit := public.plan_limit(new.org_id, 'projects');
    select count(*) into _used from public.projects where org_id = new.org_id and status <> 'archived';
    if _limit is not null and _used >= _limit then
      raise exception 'Your plan allows % active projects. Archive one or upgrade.', _limit;
    end if;
  elsif tg_table_name = 'attachments' then
    _limit := public.plan_limit(new.org_id, 'storage');
    select coalesce(sum(size_bytes), 0) into _used from public.attachments where org_id = new.org_id;
    if _limit is not null and _used + new.size_bytes > _limit::bigint * 1024 * 1024 then
      raise exception 'Your plan includes % MB of file storage. Upgrade for more.', _limit;
    end if;
  end if;
  return new;
end;
$$;

create trigger org_members_plan_limit before insert or update of status on public.org_members
  for each row execute function public.enforce_plan_limits();
create trigger projects_plan_limit before insert on public.projects
  for each row execute function public.enforce_plan_limits();
create trigger attachments_plan_limit before insert on public.attachments
  for each row execute function public.enforce_plan_limits();

create or replace function public.admin_set_org_plan(_org uuid, _plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admins only';
  end if;
  update public.organizations set plan = _plan where id = _org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rates and budgets
-- ---------------------------------------------------------------------------
alter table public.projects
  add column billing_type text not null default 'hourly' check (billing_type in ('none', 'hourly', 'fixed')),
  add column hourly_rate numeric(10, 2) check (hourly_rate >= 0),
  add column budget_amount numeric(12, 2) check (budget_amount >= 0),
  add column budget_hours numeric(10, 2) check (budget_hours >= 0),
  add column client_name text,
  add column client_email text;

create table public.member_rates (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  cost_rate numeric(10, 2) check (cost_rate >= 0),
  primary key (org_id, user_id)
);

alter table public.member_rates enable row level security;
create policy member_rates_select on public.member_rates for select to authenticated using (
  public.has_org_perm(org_id, 'invoice.manage') or public.has_org_perm(org_id, 'budget.view') or user_id = auth.uid()
);
create policy member_rates_write on public.member_rates for all to authenticated
  using (public.has_org_perm(org_id, 'invoice.manage')) with check (public.has_org_perm(org_id, 'invoice.manage'));

-- Rate for a person on a project: personal rate, else project rate, else 0.
create or replace function public.billing_rate(_project uuid, _user uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.hourly_rate from public.member_rates r join public.projects p on p.org_id = r.org_id where p.id = _project and r.user_id = _user),
    (select hourly_rate from public.projects where id = _project),
    0
  );
$$;

-- Budget, cost and billable totals, for people allowed to see money.
create or replace function public.project_financials(_project uuid)
returns table (
  budget_amount numeric, budget_hours numeric, logged_hours numeric, billable_hours numeric,
  billable_value numeric, invoiced_amount numeric, paid_amount numeric, currency text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_project_perm(_project, 'budget.view') then
    raise exception 'Missing permission to see budgets';
  end if;
  return query
  select p.budget_amount, p.budget_hours,
    round(coalesce(sum(e.minutes), 0) / 60.0, 2),
    round(coalesce(sum(e.minutes) filter (where e.billable), 0) / 60.0, 2),
    round(coalesce(sum(e.minutes / 60.0 * public.billing_rate(p.id, e.user_id)) filter (where e.billable), 0), 2),
    (select coalesce(sum(total), 0) from public.invoices i where i.project_id = p.id and i.status in ('sent', 'paid')),
    (select coalesce(sum(total), 0) from public.invoices i where i.project_id = p.id and i.status = 'paid'),
    o.currency
  from public.projects p
  join public.organizations o on o.id = p.org_id
  left join public.time_entries e on e.project_id = p.id
  where p.id = _project
  group by p.id, o.currency;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  issue_date date not null default current_date,
  due_date date,
  currency text not null,
  bill_to_name text,
  bill_to_email text,
  notes text check (char_length(notes) <= 5000),
  subtotal numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz,
  unique (org_id, number)
);

create index invoices_org_idx on public.invoices (org_id, issue_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 500),
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  amount numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  position int not null default 0
);

alter table public.time_entries add column invoice_id uuid references public.invoices (id) on delete set null;
create index time_entries_invoice_idx on public.time_entries (invoice_id);

create or replace function public.recalc_invoice(_invoice uuid)
returns void language sql security definer set search_path = '' as $$
  update public.invoices i set
    subtotal = s.sub,
    tax_amount = round(s.sub * i.tax_rate / 100, 2),
    total = s.sub + round(s.sub * i.tax_rate / 100, 2)
  from (select coalesce(sum(amount), 0) as sub from public.invoice_items where invoice_id = _invoice) s
  where i.id = _invoice;
$$;

create or replace function public.prepare_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _o public.organizations;
begin
  if tg_op = 'INSERT' then
    select * into _o from public.organizations where id = new.org_id;
    perform set_config('app.skip_plan_limits', 'on', true);
    update public.organizations set invoice_seq = invoice_seq + 1 where id = new.org_id returning invoice_seq into _o.invoice_seq;
    new.number := _o.invoice_prefix || '-' || lpad(_o.invoice_seq::text, 4, '0');
    new.currency := coalesce(new.currency, _o.currency);
    -- The column defaults to 0, so 0 means "use the organization's rate".
    new.tax_rate := case when coalesce(new.tax_rate, 0) = 0 then _o.tax_rate else new.tax_rate end;
    new.due_date := coalesce(new.due_date, new.issue_date + _o.payment_terms_days);
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft';
  else
    new.number := old.number;
    new.org_id := old.org_id;
    if old.status <> 'draft' and (new.subtotal, new.tax_rate, new.currency) is distinct from (old.subtotal, old.tax_rate, old.currency)
       and current_setting('app.recalc', true) is distinct from 'on' then
      raise exception 'Only draft invoices can be changed';
    end if;
    if new.status = 'sent' and old.status = 'draft' then new.sent_at := now(); end if;
    if new.status = 'paid' and old.status <> 'paid' then new.paid_at := now(); end if;
    if new.status = 'draft' and old.status <> 'draft' then
      raise exception 'Sent invoices cannot go back to draft';
    end if;
    if new.status = 'void' and old.status <> 'void' then
      -- Release the time so it can be billed again.
      update public.time_entries set invoice_id = null where invoice_id = old.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_prepare before insert or update on public.invoices
  for each row execute function public.prepare_invoice();

create or replace function public.on_invoice_item_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if tg_op <> 'DELETE' then
    select org_id into new.org_id from public.invoices where id = new.invoice_id;
    if (select status from public.invoices where id = new.invoice_id) <> 'draft' then
      raise exception 'Only draft invoices can be changed';
    end if;
    return new;
  end if;
  if (select status from public.invoices where id = old.invoice_id) not in ('draft') and exists (select 1 from public.invoices where id = old.invoice_id) then
    raise exception 'Only draft invoices can be changed';
  end if;
  return old;
end;
$$;

create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function public.on_invoice_item_change();

create or replace function public.after_invoice_item_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.recalc', 'on', true);
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  perform set_config('app.recalc', 'off', true);
  return null;
end;
$$;

create trigger invoice_items_recalc after insert or update or delete on public.invoice_items
  for each row execute function public.after_invoice_item_change();

create or replace function public.on_invoice_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('sent', 'paid', 'void') then
    perform public.log_activity(new.org_id, new.project_id, 'invoice_' || new.status, 'invoice', new.id,
      'marked invoice ' || new.number || ' as ' || new.status, new.status <> 'void');
  end if;
  return null;
end;
$$;

create trigger invoices_activity after update on public.invoices
  for each row execute function public.on_invoice_status();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

-- Staff with invoice.manage see all; clients see sent and paid invoices for their projects.
create policy invoices_select on public.invoices for select to authenticated using (
  public.has_org_perm(org_id, 'invoice.manage')
  or (status in ('sent', 'paid') and project_id is not null and public.can_view_project(project_id)
      and (public.is_org_client(org_id) or public.has_project_perm(project_id, 'budget.view')))
);
create policy invoices_insert on public.invoices for insert to authenticated with check (public.has_org_perm(org_id, 'invoice.manage'));
create policy invoices_update on public.invoices for update to authenticated
  using (public.has_org_perm(org_id, 'invoice.manage')) with check (public.has_org_perm(org_id, 'invoice.manage'));
create policy invoices_delete on public.invoices for delete to authenticated
  using (public.has_org_perm(org_id, 'invoice.manage') and status = 'draft');

create or replace function public.can_view_invoice(_invoice uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invoices i where i.id = _invoice and (
      public.has_org_perm(i.org_id, 'invoice.manage')
      or (i.status in ('sent', 'paid') and i.project_id is not null and public.can_view_project(i.project_id)
          and (public.is_org_client(i.org_id) or public.has_project_perm(i.project_id, 'budget.view')))
    )
  );
$$;

create policy invoice_items_select on public.invoice_items for select to authenticated using (public.can_view_invoice(invoice_id));
create policy invoice_items_write on public.invoice_items for all to authenticated
  using (public.has_org_perm(org_id, 'invoice.manage')) with check (public.has_org_perm(org_id, 'invoice.manage'));

-- Build a draft invoice from approved, billable, not-yet-invoiced time.
create or replace function public.create_invoice_from_time(_project uuid, _from date, _to date, _group text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _p public.projects;
  _inv uuid;
  _n int := 0;
begin
  select * into _p from public.projects where id = _project;
  if not found or not public.has_org_perm(_p.org_id, 'invoice.manage') then
    raise exception 'Missing permission to create invoices';
  end if;
  if not exists (
    select 1 from public.time_entries
    where project_id = _project and status = 'approved' and billable and invoice_id is null and work_date between _from and _to
  ) then
    raise exception 'No approved, billable, uninvoiced time in that range';
  end if;

  insert into public.invoices (org_id, project_id, number, currency, bill_to_name, bill_to_email, notes)
  values (_p.org_id, _project, 'pending', null, _p.client_name, _p.client_email,
    'Work on ' || _p.name || ', ' || to_char(_from, 'Mon DD') || ' to ' || to_char(_to, 'Mon DD, YYYY'))
  returning id into _inv;

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
  select _inv, g.description, round(g.minutes / 60.0, 2), g.rate, row_number() over (order by g.description)
  from (
    select
      case _group
        when 'person' then coalesce(pr.full_name, pr.email)
        when 'task' then coalesce(p.key || '-' || t.number || ' ' || t.title, 'General work')
        else coalesce(pr.full_name, pr.email) || ', ' || to_char(e.work_date, 'Mon DD') || coalesce(': ' || e.note, '')
      end as description,
      public.billing_rate(e.project_id, e.user_id) as rate,
      sum(e.minutes) as minutes
    from public.time_entries e
    join public.projects p on p.id = e.project_id
    join public.profiles pr on pr.id = e.user_id
    left join public.tasks t on t.id = e.task_id
    where e.project_id = _project and e.status = 'approved' and e.billable and e.invoice_id is null
      and e.work_date between _from and _to
    group by 1, 2, case when _group in ('person', 'task') then null else e.id end
  ) g;
  get diagnostics _n = row_count;

  update public.time_entries set invoice_id = _inv
  where project_id = _project and status = 'approved' and billable and invoice_id is null and work_date between _from and _to;
  return _inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Automation rules (run inside the database, as part of the change)
-- ---------------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade, -- null = every project
  name text not null check (char_length(name) between 1 and 120),
  enabled boolean not null default true,
  trigger text not null check (trigger in ('task.created', 'task.status_changed', 'task.completed', 'bug.created', 'bug.status_changed')),
  conditions jsonb not null default '{}',
  actions jsonb not null default '[]' check (jsonb_typeof(actions) = 'array'),
  run_count int not null default 0,
  last_run_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.automation_runs (
  id bigint generated always as identity primary key,
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_id uuid,
  ok boolean not null,
  message text,
  created_at timestamptz not null default now()
);

create index automation_runs_rule_idx on public.automation_runs (rule_id, created_at desc);

alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
create policy automation_rules_select on public.automation_rules for select to authenticated using (public.has_org_perm(org_id, 'automation.manage'));
create policy automation_rules_write on public.automation_rules for all to authenticated
  using (public.has_org_perm(org_id, 'automation.manage')) with check (public.has_org_perm(org_id, 'automation.manage'));
create policy automation_runs_select on public.automation_runs for select to authenticated using (public.has_org_perm(org_id, 'automation.manage'));

create or replace function public.prepare_automation_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null then
    select org_id into new.org_id from public.projects where id = new.project_id;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

create trigger automation_rules_prepare before insert or update on public.automation_rules
  for each row execute function public.prepare_automation_rule();

-- Does a row match a rule's conditions? Conditions are all optional.
create or replace function public.automation_matches(_c jsonb, _status uuid, _category text, _priority text, _list uuid, _severity text, _bug_status text)
returns boolean language sql immutable as $$
  select (not _c ? 'status_id' or _c ->> 'status_id' = _status::text)
     and (not _c ? 'status_category' or _c ->> 'status_category' = _category)
     and (not _c ? 'priority' or _c ->> 'priority' = _priority)
     and (not _c ? 'list_id' or _c ->> 'list_id' = _list::text)
     and (not _c ? 'severity' or _c ->> 'severity' = _severity)
     and (not _c ? 'bug_status' or _c ->> 'bug_status' = _bug_status);
$$;

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

create trigger tasks_automation after insert or update on public.tasks
  for each row execute function public.run_task_automations();

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

create trigger bugs_automation after insert or update on public.bugs
  for each row execute function public.run_bug_automations();

-- Invoicing marks approved time with invoice_id; that alone is not an edit of
-- locked time. Only invoice managers (or the system) may set it.
create or replace function public.guard_time_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _approver boolean;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    if auth.uid() is not null and not public.has_org_perm(old.org_id, 'invoice.manage') then
      raise exception 'Only invoice managers can change billing on time entries';
    end if;
    if (new.minutes, new.work_date, new.note, new.billable, new.status, new.task_id, new.bug_id)
       is not distinct from (old.minutes, old.work_date, old.note, old.billable, old.status, old.task_id, old.bug_id) then
      return new;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id
     and (new.minutes, new.billable) is distinct from (old.minutes, old.billable) then
    raise exception 'This time is on an invoice and cannot be changed';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.status := 'draft';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.invoice_id := null;
  else
    new.user_id := old.user_id;
    new.project_id := old.project_id;
    _approver := auth.uid() is null or public.has_project_perm(old.project_id, 'timesheet.approve');
    if new.status is distinct from old.status then
      if new.status in ('approved', 'rejected') then
        if not _approver or old.status <> 'submitted' then
          raise exception 'Only approvers can review submitted time';
        end if;
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      elsif new.status = 'submitted' and old.status not in ('draft', 'rejected') then
        raise exception 'Only draft or rejected time can be submitted';
      elsif new.status = 'draft' and old.status <> 'submitted' then
        raise exception 'Approved time cannot be reopened';
      end if;
    elsif old.status in ('submitted', 'approved') and not _approver then
      raise exception 'Submitted time is locked';
    end if;
  end if;
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'Task belongs to another project';
  end if;
  if new.bug_id is not null and not exists (select 1 from public.bugs where id = new.bug_id and project_id = new.project_id) then
    raise exception 'Bug belongs to another project';
  end if;
  return new;
end;
$$;

-- Comments written by automation rules have no author ("Automation").
create or replace function public.prepare_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('app.in_automation', true) is distinct from 'on' then
      new.author_id := coalesce(auth.uid(), new.author_id);
    end if;
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
