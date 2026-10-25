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
  currency: string;
  invoice_prefix: string;
  tax_rate: number;
  payment_terms_days: number;
  billing_address: string | null;
  require_mfa: boolean;
  sso_domain: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

export type Plan = {
  key: string;
  name: string;
  max_members: number | null;
  max_projects: number | null;
  max_storage_mb: number | null;
  price_monthly: number;
  position: number;
};

export type Invoice = {
  id: string;
  org_id: string;
  project_id: string | null;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  issue_date: string;
  due_date: string | null;
  currency: string;
  bill_to_name: string | null;
  bill_to_email: string | null;
  notes: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
};

export type InvoiceItem = { id: string; description: string; quantity: number; unit_price: number; amount: number; position: number };

export type AutomationRule = {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  enabled: boolean;
  trigger: "task.created" | "task.status_changed" | "task.completed" | "bug.created" | "bug.status_changed";
  conditions: Record<string, string>;
  actions: Record<string, string | boolean>[];
  run_count: number;
  last_run_at: string | null;
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
  billing_type?: "none" | "hourly" | "fixed";
  hourly_rate?: number | null;
  budget_amount?: number | null;
  budget_hours?: number | null;
  client_name?: string | null;
  client_email?: string | null;
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
  recurrence: Recurrence | null;
  next_task_id: string | null;
};

export type Recurrence = "daily" | "weekly" | "biweekly" | "monthly";

export type BugStatus = "new" | "open" | "in_progress" | "fixed" | "verified" | "closed" | "reopened";
export type BugSeverity = "minor" | "major" | "critical" | "blocker";

export type Bug = {
  id: string;
  org_id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  steps: string | null;
  environment: string | null;
  severity: BugSeverity;
  reproducibility: "always" | "sometimes" | "rarely" | "unable";
  status: BugStatus;
  reporter_id: string | null;
  assignee_id: string | null;
  task_id: string | null;
  milestone_id: string | null;
  client_visible: boolean;
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  closed_at: string | null;
};

export type TimeEntry = {
  id: string;
  project_id: string;
  task_id: string | null;
  bug_id: string | null;
  user_id: string;
  work_date: string;
  minutes: number;
  note: string | null;
  billable: boolean;
  status: "draft" | "submitted" | "approved" | "rejected";
  reviewed_by: string | null;
  created_at: string;
};

export type Timer = {
  user_id: string;
  project_id: string;
  task_id: string | null;
  bug_id: string | null;
  note: string | null;
  started_at: string;
};

export type CustomField = {
  id: string;
  project_id: string;
  name: string;
  field_type: "text" | "number" | "date" | "select" | "checkbox";
  options: string[];
  position: number;
};

export type Doc = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  body: string;
  client_visible: boolean;
  position: number;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Topic = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  author_id: string | null;
  pinned: boolean;
  locked: boolean;
  client_visible: boolean;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
};

export type ChatMessage = { id: string; project_id: string; author_id: string; body: string; created_at: string; edited_at: string | null };

export type CalendarEvent = {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  client_visible: boolean;
  created_by: string | null;
};

export type ProjectTemplate = { id: string; name: string; description: string | null; created_at: string };

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
