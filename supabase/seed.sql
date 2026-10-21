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

select set_config('app.creating_org', 'off', false);
