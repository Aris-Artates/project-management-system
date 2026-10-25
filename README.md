# project-management-system

Multi-organization project management: projects, tasks, boards, calendars, files and discussions, with roles each organization defines for itself and a separate portal for clients.

## Stack

- Next.js 16 (App Router, Server Actions)
- Supabase: Postgres with row level security, Auth, Storage, Realtime
- Tailwind CSS 4

## Access model

Preset roles:

| Role | Scope | Notes |
| --- | --- | --- |
| Dev | Platform | Everything, including granting platform roles |
| Super Admin | Platform | Create, suspend and delete organizations; manage every org |
| Org Admin | Organization | Full control of one organization |
| Client | Organization | Sees only invited projects and what is shared with clients |

Every other role (project manager, developer, QA, anything else) is created per organization in **Roles and access** using a permission grid. Project-scoped permissions can be overridden per project. Access is enforced in Postgres (RLS and the helper functions in `supabase/migrations`), and the UI only hides what a person cannot use.

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, publishable key and database URL.

3. In the Supabase dashboard, under Authentication > URL Configuration, set the Site URL to `http://localhost:3200` and add `http://localhost:3200/**` to the redirect URLs.

4. Apply the schema (add `--include-seed` to load the demo data in `supabase/seed.sql`)

   ```bash
   npx supabase db push --db-url "$SUPABASE_DB_URL"
   ```

5. Run the app at http://localhost:3200

   ```bash
   npm run dev
   ```

To make your own account a Dev, sign up first and then run in the SQL editor:

```sql
update public.profiles set platform_role = 'dev' where email = 'you@example.com';
```

Emails (invitations, assignments, mentions, invoices) are sent through SMTP when `SMTP_HOST` is set; otherwise they are skipped and logged.

### Integrations and platform settings

- **Site URL for links in webhooks and calendar feeds**: run `insert into public.app_settings (key, value) values ('site_url', 'https://your-domain') on conflict (key) do update set value = excluded.value;`
- **Webhooks and Slack** are delivered from the database with the `pg_net` extension; event reminders run every 10 minutes with `pg_cron`. Both are enabled by the migrations.
- **GitHub**: connect it under Settings, Integrations, then add the shown payload URL and secret as a push webhook in the repository.
- **Public API**: create keys under Settings, Integrations. The reference is on the API reference page there.
- **Stripe** (optional): set the `STRIPE_*` variables and `SUPABASE_SERVICE_ROLE_KEY`, create a webhook in Stripe pointing to `/api/billing/webhook` with the events `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Without Stripe, platform admins set plans in the admin console.
- **SSO**: register a SAML identity provider in Supabase (paid plan), then set the organization's SSO domain under Settings, Security.
- **Two-factor authentication** works out of the box (authenticator apps). Organizations can require it under Settings, Security.

## Roadmap

- Phase 1 (done): organizations, invitations, role builder, projects, tasks and subtasks, list, board and calendar views, comments with mentions, files, notifications, client portal, search, platform admin
- Phase 2 (done): Gantt with dependencies and drag to reschedule, bug tracker with a verify and close workflow, time tracking with timers, weekly timesheets and approvals, project templates, custom fields, recurring tasks, workload view
- Phase 3 (done): wiki pages with version history, discussion topics, live team chat, events with invites and RSVPs, org and project calendars, reports and dashboards with CSV export, portfolio health view
- Phase 4 (done): budgets, rates and invoicing, automation rules, webhooks and Slack, GitHub commit linking, iCal feeds, public REST API with keys, plans with limits and optional Stripe billing, audit log, two-factor sign-in, SSO sign-in, data export
