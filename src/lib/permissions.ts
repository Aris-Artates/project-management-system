// Mirrors public.permission_catalog. The database is the source of truth; this
// list only gives the app type-safe keys.
export const PERMISSIONS = [
  "org.settings",
  "member.invite",
  "member.manage",
  "role.manage",
  "client.invite",
  "project.view_all",
  "project.create",
  "project.edit",
  "project.delete",
  "project.manage_members",
  "task.create",
  "task.edit",
  "task.edit_own",
  "task.assign",
  "task.delete",
  "milestone.manage",
  "comment.create",
  "comment.delete_any",
  "file.upload",
  "file.delete_any",
  "template.manage",
  "bug.create",
  "bug.edit",
  "bug.assign",
  "bug.verify",
  "bug.delete",
  "time.log",
  "time.view_all",
  "timesheet.approve",
  "report.view",
  "doc.edit",
  "doc.delete",
  "forum.post",
  "forum.moderate",
  "chat.use",
  "event.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type SystemRoleKey = "org_admin" | "client";
export type PlatformRole = "dev" | "super_admin";
