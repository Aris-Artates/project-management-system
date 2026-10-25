-- Local demo data. Every account below uses the password: Password123!
--
--   dev@pms.test        Dev (platform)
--   super@pms.test      Super Admin (platform)
--   admin@acme.test     Org Admin, Acme Studio
--   pm@acme.test        "Project Manager" (custom role), Acme
--   dev@acme.test       "Developer" (custom role), Acme
--   qa@acme.test        "QA" (custom role), Acme
--   client@acme.test    Client, Acme (Website Redesign only)
--   admin@globex.test   Org Admin, Globex
--   client@globex.test  Client, Globex

select set_config('app.creating_org', 'on', false);

do $$
declare
  _users text[][] := array[
    ['00000000-0000-4000-a000-000000000001', 'dev@pms.test',       'Dana Dev'],
    ['00000000-0000-4000-a000-000000000002', 'super@pms.test',     'Sam Super'],
    ['00000000-0000-4000-a000-000000000011', 'admin@acme.test',    'Ava Admin'],
    ['00000000-0000-4000-a000-000000000012', 'pm@acme.test',       'Priya Manager'],
    ['00000000-0000-4000-a000-000000000013', 'dev@acme.test',      'Diego Developer'],
    ['00000000-0000-4000-a000-000000000014', 'qa@acme.test',       'Quinn Tester'],
    ['00000000-0000-4000-a000-000000000015', 'client@acme.test',   'Carla Client'],
    ['00000000-0000-4000-a000-000000000021', 'admin@globex.test',  'Gabe Admin'],
    ['00000000-0000-4000-a000-000000000022', 'client@globex.test', 'Gina Client']
  ];
  _u text[];
  _id uuid;
  acme uuid := '00000000-0000-4000-b000-000000000001';
  globex uuid := '00000000-0000-4000-b000-000000000002';
  r_admin uuid; r_client uuid; r_pm uuid; r_dev uuid; r_qa uuid;
  g_admin uuid; g_client uuid;
  web uuid; app uuid; ops uuid;
  s_todo uuid; s_prog uuid; s_review uuid; s_done uuid;
  l_general uuid; l_design uuid;
  m_launch uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid;
begin
  foreach _u slice 1 in array _users loop
    _id := _u[1]::uuid;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated', _u[2],
      extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', _u[3]), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), _id, _id::text,
      jsonb_build_object('sub', _id::text, 'email', _u[2], 'email_verified', true), 'email', now(), now(), now());
  end loop;

  update public.profiles set platform_role = 'dev' where email = 'dev@pms.test';
  update public.profiles set platform_role = 'super_admin' where email = 'super@pms.test';

  -- Organizations with their two preset roles.
  insert into public.organizations (id, name, slug, created_by) values
    (acme, 'Acme Studio', 'acme', '00000000-0000-4000-a000-000000000011'),
    (globex, 'Globex', 'globex', '00000000-0000-4000-a000-000000000021');

  insert into public.roles (org_id, name, description, color, position, system_key, permissions) values
    (acme, 'Org Admin', 'Full control of this organization', '#0f766e', 0, 'org_admin', '{}'),
    (acme, 'Client', 'External contact who sees only invited projects', '#b45309', 1000, 'client',
      '{comment.create,task.create,file.upload}'),
    (globex, 'Org Admin', 'Full control of this organization', '#0f766e', 0, 'org_admin', '{}'),
    (globex, 'Client', 'External contact who sees only invited projects', '#b45309', 1000, 'client', '{comment.create}');

  select id into r_admin from public.roles where org_id = acme and system_key = 'org_admin';
  select id into r_client from public.roles where org_id = acme and system_key = 'client';
  select id into g_admin from public.roles where org_id = globex and system_key = 'org_admin';
  select id into g_client from public.roles where org_id = globex and system_key = 'client';

  -- Sample custom roles, built the same way an Org Admin would.
  insert into public.roles (org_id, name, description, color, position, permissions) values
    (acme, 'Project Manager', 'Runs projects end to end', '#7c3aed', 10,
      '{member.invite,client.invite,project.create,project.edit,project.manage_members,task.create,task.edit,task.assign,task.delete,milestone.manage,comment.create,comment.delete_any,file.upload,file.delete_any}')
    returning id into r_pm;
  insert into public.roles (org_id, name, description, color, position, permissions) values
    (acme, 'Developer', 'Builds and updates their own work', '#2563eb', 20,
      '{task.create,task.edit_own,comment.create,file.upload}')
    returning id into r_dev;
  insert into public.roles (org_id, name, description, color, position, permissions) values
    (acme, 'QA', 'Tests work and reopens tasks', '#db2777', 30,
      '{task.create,task.edit,comment.create,file.upload}')
    returning id into r_qa;

  insert into public.org_members (org_id, user_id, role_id) values
    (acme, '00000000-0000-4000-a000-000000000011', r_admin),
    (acme, '00000000-0000-4000-a000-000000000012', r_pm),
    (acme, '00000000-0000-4000-a000-000000000013', r_dev),
    (acme, '00000000-0000-4000-a000-000000000014', r_qa),
    (acme, '00000000-0000-4000-a000-000000000015', r_client),
    (globex, '00000000-0000-4000-a000-000000000021', g_admin),
    (globex, '00000000-0000-4000-a000-000000000022', g_client);

  -- Projects
  insert into public.projects (org_id, key, name, description, color, start_date, end_date, created_by)
  values (acme, 'WEB', 'Website Redesign', 'New marketing site for the spring launch.', '#4f46e5',
    current_date - 14, current_date + 30, '00000000-0000-4000-a000-000000000012')
  returning id into web;
  insert into public.projects (org_id, key, name, description, color, created_by)
  values (acme, 'APP', 'Mobile App', 'Internal field app, phase one.', '#0891b2', '00000000-0000-4000-a000-000000000012')
  returning id into app;
  insert into public.projects (org_id, key, name, description, color, created_by)
  values (globex, 'OPS', 'Operations Portal', 'Self-service portal for the ops team.', '#ea580c', '00000000-0000-4000-a000-000000000021')
  returning id into ops;

  insert into public.project_members (project_id, user_id, org_id) values
    (web, '00000000-0000-4000-a000-000000000013', acme),
    (web, '00000000-0000-4000-a000-000000000014', acme),
    (web, '00000000-0000-4000-a000-000000000015', acme),
    (app, '00000000-0000-4000-a000-000000000013', acme),
    (ops, '00000000-0000-4000-a000-000000000022', globex);

  select id into s_todo from public.task_statuses where project_id = web and position = 0;
  select id into s_prog from public.task_statuses where project_id = web and position = 1;
  select id into s_review from public.task_statuses where project_id = web and position = 2;
  select id into s_done from public.task_statuses where project_id = web and position = 3;
  select id into l_general from public.task_lists where project_id = web;
  insert into public.task_lists (project_id, org_id, name, position) values (web, acme, 'Design', 1) returning id into l_design;

  insert into public.milestones (project_id, org_id, name, due_date) values (web, acme, 'Public launch', current_date + 30)
  returning id into m_launch;

  insert into public.tags (project_id, org_id, name, color) values
    (web, acme, 'frontend', '#0ea5e9'), (web, acme, 'content', '#f59e0b');

  insert into public.tasks (project_id, list_id, milestone_id, title, description, status_id, priority, due_date, client_visible, position, created_by)
  values (web, l_design, m_launch, 'Homepage wireframes', 'Low-fidelity layouts for desktop and phone.', s_done, 'high', current_date - 3, true, 1, '00000000-0000-4000-a000-000000000012')
  returning id into t1;
  insert into public.tasks (project_id, list_id, milestone_id, title, description, status_id, priority, due_date, client_visible, position, created_by)
  values (web, l_general, m_launch, 'Build hero section', 'Responsive hero with headline, CTA and illustration.', s_prog, 'high', current_date + 2, true, 2, '00000000-0000-4000-a000-000000000012')
  returning id into t2;
  insert into public.tasks (project_id, list_id, title, status_id, priority, due_date, client_visible, position, created_by)
  values (web, l_general, 'Set up analytics events', s_todo, 'medium', current_date + 7, false, 3, '00000000-0000-4000-a000-000000000012')
  returning id into t3;
  insert into public.tasks (project_id, list_id, title, status_id, priority, due_date, client_visible, position, created_by)
  values (web, l_general, 'Cross-browser test pass', s_review, 'medium', current_date - 1, false, 4, '00000000-0000-4000-a000-000000000014')
  returning id into t4;
  insert into public.tasks (project_id, list_id, parent_id, title, status_id, priority, position, created_by)
  values (web, l_general, t2, 'Export hero illustration as SVG', s_todo, 'low', 1, '00000000-0000-4000-a000-000000000013')
  returning id into t5;

  insert into public.task_assignees (task_id, user_id) values
    (t1, '00000000-0000-4000-a000-000000000012'),
    (t2, '00000000-0000-4000-a000-000000000013'),
    (t3, '00000000-0000-4000-a000-000000000013'),
    (t4, '00000000-0000-4000-a000-000000000014'),
    (t5, '00000000-0000-4000-a000-000000000013');

  insert into public.task_tags (task_id, tag_id)
  select t2, id from public.tags where project_id = web and name = 'frontend';

  insert into public.comments (project_id, task_id, author_id, body, is_internal) values
    (web, t2, '00000000-0000-4000-a000-000000000015', 'Can we try a darker background on the hero?', false),
    (web, t2, '00000000-0000-4000-a000-000000000013', 'Sure, pushing a variant today.', false),
    (web, t2, '00000000-0000-4000-a000-000000000012', 'Internal: keep the budget for illustration under 6 hours.', true),
    (web, null, '00000000-0000-4000-a000-000000000012', 'Welcome to the project space! Weekly check-ins are on Mondays.', false);

  -- Globex sample task
  insert into public.tasks (project_id, title, priority, client_visible, created_by)
  values (ops, 'Gather requirements from ops leads', 'high', true, '00000000-0000-4000-a000-000000000021');
end;
$$;

-- Phase 2 demo: permissions for the sample roles, bugs, time and dependencies.
update public.roles set permissions = permissions || '{bug.create,bug.edit,bug.assign,bug.verify,bug.delete,time.log,time.view_all,timesheet.approve,template.manage}'
where name = 'Project Manager' and org_id = '00000000-0000-4000-b000-000000000001';
update public.roles set permissions = permissions || '{bug.create,time.log}'
where name = 'Developer' and org_id = '00000000-0000-4000-b000-000000000001';
update public.roles set permissions = permissions || '{bug.create,bug.edit,bug.assign,bug.verify,time.log}'
where name = 'QA' and org_id = '00000000-0000-4000-b000-000000000001';
update public.roles set permissions = permissions || '{bug.create}'
where system_key = 'client' and org_id = '00000000-0000-4000-b000-000000000001';

do $$
declare
  web uuid := (select id from public.projects where key = 'WEB' and org_id = '00000000-0000-4000-b000-000000000001');
  hero uuid := (select id from public.tasks where project_id = web and title = 'Build hero section');
  wire uuid := (select id from public.tasks where project_id = web and title = 'Homepage wireframes');
  analytics uuid := (select id from public.tasks where project_id = web and title = 'Set up analytics events');
begin
  insert into public.task_dependencies (task_id, depends_on_id) values (hero, wire), (analytics, hero) on conflict do nothing;
  update public.tasks set start_date = current_date - 10 where id = wire;
  update public.tasks set start_date = current_date - 2 where id = hero;
  update public.tasks set start_date = current_date + 3 where id = analytics;

  insert into public.bugs (project_id, title, steps, environment, severity, reproducibility, reporter_id, assignee_id, task_id, client_visible)
  values
    (web, 'Hero image overlaps the menu on small phones', E'1. Open the homepage on a 375px wide screen\n2. Open the menu', 'Safari, iPhone SE', 'major', 'always',
      '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-a000-000000000013', hero, true),
    (web, 'Contact form shows no error for an invalid email', E'1. Type "abc" in the email field\n2. Submit', 'Chrome 140, Windows', 'minor', 'always',
      '00000000-0000-4000-a000-000000000014', null, null, false);

  insert into public.time_entries (project_id, task_id, user_id, work_date, minutes, note) values
    (web, wire, '00000000-0000-4000-a000-000000000012', current_date - 4, 180, 'Wireframes, desktop'),
    (web, wire, '00000000-0000-4000-a000-000000000012', current_date - 3, 120, 'Wireframes, mobile'),
    (web, hero, '00000000-0000-4000-a000-000000000013', current_date - 1, 150, 'Hero layout'),
    (web, hero, '00000000-0000-4000-a000-000000000013', current_date, 90, 'Hero illustration slot');
  update public.tasks set estimate_hours = 6 where id = wire;
  update public.tasks set estimate_hours = 8 where id = hero;
  update public.tasks set estimate_hours = 4 where id = analytics;
end;
$$;

-- Phase 3 demo: permissions for the sample roles, a wiki page, a topic and an event.
update public.roles set permissions = permissions || '{report.view,doc.edit,doc.delete,forum.post,forum.moderate,chat.use,event.manage}'
where name = 'Project Manager' and org_id = '00000000-0000-4000-b000-000000000001';
update public.roles set permissions = permissions || '{doc.edit,forum.post,chat.use}'
where name in ('Developer', 'QA') and org_id = '00000000-0000-4000-b000-000000000001';
update public.roles set permissions = permissions || '{forum.post}'
where system_key = 'client' and org_id = '00000000-0000-4000-b000-000000000001';

do $$
declare
  web uuid := (select id from public.projects where key = 'WEB' and org_id = '00000000-0000-4000-b000-000000000001');
  pm uuid := '00000000-0000-4000-a000-000000000012';
  topic uuid;
  ev uuid;
begin
  insert into public.documents (project_id, title, body, client_visible, created_by)
  values (web, 'Project brief', E'## Goal\n\nLaunch the new marketing site before the spring campaign.\n\n## Scope\n\n- Homepage and three landing pages\n- Contact form\n- Analytics events\n\n## Out of scope\n\n- Blog migration', true, pm);
  insert into public.documents (project_id, title, body, created_by)
  values (web, 'Team notes', E'Internal notes for the team.\n\n- Staging deploys go out on Tuesdays\n- Ask Quinn for a test pass before handing work to the client', pm);

  insert into public.topics (project_id, title, body, author_id, pinned)
  values (web, 'Launch checklist', 'Anything missing before we go live? Add it here.', pm, true)
  returning id into topic;
  insert into public.comments (project_id, topic_id, body, author_id)
  values (web, topic, 'Can we confirm the domain switch date?', '00000000-0000-4000-a000-000000000015');

  insert into public.events (project_id, title, description, location, starts_at, ends_at, client_visible, created_by)
  values (web, 'Design review with client', 'Walk through the homepage and pricing page.', 'Video call',
    date_trunc('day', now()) + interval '2 days 15 hours', date_trunc('day', now()) + interval '2 days 16 hours', true, pm)
  returning id into ev;
  insert into public.event_attendees (event_id, user_id) values
    (ev, pm), (ev, '00000000-0000-4000-a000-000000000013'), (ev, '00000000-0000-4000-a000-000000000015');

  insert into public.chat_messages (project_id, body, author_id) values
    (web, 'Morning! Hero variant is on staging.', '00000000-0000-4000-a000-000000000013'),
    (web, 'Nice, I will run the test pass after lunch.', '00000000-0000-4000-a000-000000000014');
end;
$$;

-- Phase 4 demo: plan, rates, budget, billing permissions, site URL.
insert into public.app_settings (key, value) values ('site_url', 'https://pm-aris.vercel.app')
on conflict (key) do update set value = excluded.value;

update public.organizations set plan = 'team', tax_rate = 12, billing_address = E'Acme Studio\n123 Market Street\nSpringfield'
where id = '00000000-0000-4000-b000-000000000001';

update public.roles set permissions = permissions || '{invoice.manage,budget.view}'
where name = 'Project Manager' and org_id = '00000000-0000-4000-b000-000000000001';

update public.projects set hourly_rate = 120, budget_amount = 15000, budget_hours = 120,
  client_name = 'Carla Client', client_email = 'client@acme.test'
where key = 'WEB' and org_id = '00000000-0000-4000-b000-000000000001';

insert into public.member_rates (org_id, user_id, hourly_rate, cost_rate) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000012', 150, 70),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000013', 110, 55),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000014', 90, 45)
on conflict (org_id, user_id) do nothing;

select set_config('app.creating_org', 'off', false);
