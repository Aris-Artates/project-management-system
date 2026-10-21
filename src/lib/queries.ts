import "server-only";
import { getSupabase } from "./session";
import type { Milestone, PersonLite, Role, Tag, Task, TaskList, TaskStatus } from "./types";

export type TaskRow = Task & {
  assignees: { user_id: string; profile: PersonLite }[];
  tags: { tag_id: string }[];
};

const TASK_SELECT =
  "*, assignees:task_assignees(user_id, profile:profiles!task_assignees_user_id_fkey(id, full_name, email, avatar_url)), tags:task_tags(tag_id)";

export async function getProjectWork(projectId: string) {
  const supabase = await getSupabase();
  const [statuses, lists, tasks, tags, milestones] = await Promise.all([
    supabase.from("task_statuses").select("*").eq("project_id", projectId).order("position"),
    supabase.from("task_lists").select("*").eq("project_id", projectId).order("position"),
    supabase.from("tasks").select(TASK_SELECT).eq("project_id", projectId).order("position").order("number"),
    supabase.from("tags").select("*").eq("project_id", projectId).order("name"),
    supabase.from("milestones").select("*").eq("project_id", projectId).order("due_date", { nullsFirst: false }),
  ]);
  return {
    statuses: (statuses.data ?? []) as TaskStatus[],
    lists: (lists.data ?? []) as TaskList[],
    tasks: (tasks.data ?? []) as unknown as TaskRow[],
    tags: (tags.data ?? []) as Tag[],
    milestones: (milestones.data ?? []) as Milestone[],
  };
}

export async function getTask(projectId: string, number: number) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .eq("number", number)
    .maybeSingle();
  return data as unknown as TaskRow | null;
}

export async function getTaskSummary(taskId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("tasks").select("number, title").eq("id", taskId).maybeSingle();
  return data as { number: number; title: string } | null;
}

export async function getSubtasks(taskId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("parent_id", taskId).order("position").order("number");
  return (data ?? []) as unknown as TaskRow[];
}

export type ProjectMember = {
  user_id: string;
  role_override_id: string | null;
  profile: PersonLite;
  orgRole: Pick<Role, "id" | "name" | "system_key" | "color"> | null;
};

export async function getProjectMembers(projectId: string, orgId: string): Promise<ProjectMember[]> {
  const supabase = await getSupabase();
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role_override_id, profile:profiles!project_members_user_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: roles } = ids.length
    ? await supabase
        .from("org_members")
        .select("user_id, role:roles(id, name, system_key, color)")
        .eq("org_id", orgId)
        .in("user_id", ids)
    : { data: [] };
  const roleByUser = new Map(
    ((roles ?? []) as unknown as { user_id: string; role: ProjectMember["orgRole"] }[]).map((r) => [r.user_id, r.role]),
  );
  return ((members ?? []) as unknown as Omit<ProjectMember, "orgRole">[])
    .map((m) => ({ ...m, orgRole: roleByUser.get(m.user_id) ?? null }))
    .sort((a, b) => (a.profile.full_name ?? a.profile.email).localeCompare(b.profile.full_name ?? b.profile.email));
}

export type CommentRow = {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  edited_at: string | null;
  author_id: string | null;
  author: PersonLite | null;
};

export async function getComments(projectId: string, taskId: string | null) {
  const supabase = await getSupabase();
  let query = supabase
    .from("comments")
    .select("id, body, is_internal, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at");
  query = taskId ? query.eq("task_id", taskId) : query.is("task_id", null);
  const { data } = await query;
  return (data ?? []) as unknown as CommentRow[];
}

export type AttachmentRow = {
  id: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  client_visible: boolean;
  created_at: string;
  task_id: string | null;
  uploaded_by: string | null;
  uploader: PersonLite | null;
  task: { number: number; title: string } | null;
};

export async function getAttachments(projectId: string, taskId?: string) {
  const supabase = await getSupabase();
  let query = supabase
    .from("attachments")
    .select(
      "id, file_name, size_bytes, mime_type, client_visible, created_at, task_id, uploaded_by, uploader:profiles!attachments_uploaded_by_fkey(id, full_name, email, avatar_url), task:tasks(number, title)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (taskId) query = query.eq("task_id", taskId);
  const { data } = await query;
  return (data ?? []) as unknown as AttachmentRow[];
}

export type ActivityRow = {
  id: number;
  summary: string;
  created_at: string;
  actor: PersonLite | null;
};

export async function getActivity(projectId: string, limit = 20) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("activity_log")
    .select("id, summary, created_at, actor:profiles!activity_log_actor_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as ActivityRow[];
}
