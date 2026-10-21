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

Emails (invitations, assignments, mentions) are sent through SMTP when `SMTP_HOST` is set; otherwise they are skipped and logged.

## Roadmap

- Phase 1 (this release): organizations, invitations, role builder, projects, tasks and subtasks, list, board and calendar views, comments with mentions, files, notifications, client portal, search, platform admin
- Phase 2: Gantt with dependencies, bug tracker, time tracking and timesheets, templates, custom fields, recurring tasks, workload
- Phase 3: wiki pages, forums and chat, events, reports and dashboards
- Phase 4: invoicing, automation rules, integrations, public API and webhooks, subscriptions, audit log, SSO
