import type { PlatformRole, SystemRoleKey } from "./permissions";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  platform_role: PlatformRole | null;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  status: "active" | "suspended";
  created_at: string;
};

export type Role = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  system_key: SystemRoleKey | null;
  permissions: string[];
};

export type CatalogEntry = {
  key: string;
  module: string;
  label: string;
  description: string | null;
  scope: "org" | "project";
  client_safe: boolean;
  sort: number;
};

export type Project = {
  id: string;
  org_id: string;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "on_hold" | "completed" | "archived";
  color: string;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  created_at: string;
};

export type TaskStatus = {
  id: string;
  project_id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  position: number;
};

export type TaskList = { id: string; project_id: string; name: string; position: number };

export type Milestone = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "done";
  client_visible: boolean;
};

export type Tag = { id: string; project_id: string; name: string; color: string };

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  org_id: string;
  project_id: string;
  list_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  number: number;
  title: string;
  description: string | null;
  status_id: string | null;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  client_visible: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type Comment = {
  id: string;
  project_id: string;
  task_id: string | null;
  author_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  edited_at: string | null;
};

export type Attachment = {
  id: string;
  project_id: string;
  task_id: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  client_visible: boolean;
  uploaded_by: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  project_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  summary: string;
  created_at: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type PersonLite = { id: string; full_name: string | null; email: string; avatar_url: string | null };
