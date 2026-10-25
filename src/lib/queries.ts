import "server-only";
import { getSupabase } from "./session";
import type { Bug, CalendarEvent, Doc, Topic, CustomField, Milestone, PersonLite, Role, Tag, Task, TaskList, TaskStatus, TimeEntry, Timer } from "./types";

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
  query = taskId ? query.eq("task_id", taskId) : query.is("task_id", null).is("bug_id", null).is("topic_id", null);
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

// --- Phase 2 ------------------------------------------------------------------

export type BugRow = Bug & {
  assignee: PersonLite | null;
  reporter: PersonLite | null;
  task: { number: number; title: string } | null;
};

const BUG_SELECT =
  "*, assignee:profiles!bugs_assignee_id_fkey(id, full_name, email, avatar_url), reporter:profiles!bugs_reporter_id_fkey(id, full_name, email, avatar_url), task:tasks!bugs_task_id_fkey(number, title)";

export async function getBugs(projectId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("bugs").select(BUG_SELECT).eq("project_id", projectId).order("number", { ascending: false });
  return (data ?? []) as unknown as BugRow[];
}

export async function getBug(projectId: string, number: number) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("bugs").select(BUG_SELECT).eq("project_id", projectId).eq("number", number).maybeSingle();
  return data as unknown as BugRow | null;
}

export async function getBugComments(projectId: string, bugId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("comments")
    .select("id, body, is_internal, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .eq("bug_id", bugId)
    .order("created_at");
  return (data ?? []) as unknown as CommentRow[];
}

export type TimeRow = TimeEntry & {
  person: PersonLite | null;
  task: { number: number; title: string } | null;
  bug: { number: number; title: string } | null;
  project: { key: string; name: string; color: string } | null;
};

const TIME_SELECT =
  "*, person:profiles!time_entries_user_id_fkey(id, full_name, email, avatar_url), task:tasks!time_entries_task_id_fkey(number, title), bug:bugs!time_entries_bug_id_fkey(number, title), project:projects!time_entries_project_id_fkey(key, name, color)";

export async function getTimeEntries(filter: { projectId?: string; taskId?: string; bugId?: string; userId?: string; orgId?: string; from?: string; to?: string; status?: string }) {
  const supabase = await getSupabase();
  let q = supabase.from("time_entries").select(TIME_SELECT).order("work_date", { ascending: false }).order("created_at", { ascending: false });
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.orgId) q = q.eq("org_id", filter.orgId);
  if (filter.taskId) q = q.eq("task_id", filter.taskId);
  if (filter.bugId) q = q.eq("bug_id", filter.bugId);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.from) q = q.gte("work_date", filter.from);
  if (filter.to) q = q.lte("work_date", filter.to);
  if (filter.status) q = q.eq("status", filter.status);
  const { data } = await q.limit(500);
  return (data ?? []) as unknown as TimeRow[];
}

export async function getMyTimer(userId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("timers")
    .select("*, task:tasks(number, title), bug:bugs(number, title), project:projects(key, name, org:organizations(slug))")
    .eq("user_id", userId)
    .maybeSingle();
  return data as unknown as
    | (Timer & {
        task: { number: number; title: string } | null;
        bug: { number: number; title: string } | null;
        project: { key: string; name: string; org: { slug: string } };
      })
    | null;
}

export async function getDependencies(projectId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("task_dependencies").select("task_id, depends_on_id").eq("project_id", projectId);
  return (data ?? []) as { task_id: string; depends_on_id: string }[];
}

export async function getCustomFields(projectId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("custom_fields").select("*").eq("project_id", projectId).order("position").order("name");
  return (data ?? []) as CustomField[];
}

export async function getFieldValues(taskId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("task_field_values").select("field_id, value").eq("task_id", taskId);
  return new Map((data ?? []).map((v) => [v.field_id as string, v.value as string | null]));
}

// --- Phase 3 ------------------------------------------------------------------

export async function getDocs(projectId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("documents")
    .select("id, project_id, parent_id, title, client_visible, position, version, updated_at, updated_by")
    .eq("project_id", projectId)
    .order("position")
    .order("title");
  return (data ?? []) as Omit<Doc, "body" | "created_by" | "created_at">[];
}

export async function getDoc(id: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("documents")
    .select("*, editor:profiles!documents_updated_by_fkey(id, full_name, email, avatar_url)")
    .eq("id", id)
    .maybeSingle();
  return data as (Doc & { editor: PersonLite | null }) | null;
}

export async function getDocVersions(docId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("document_versions")
    .select("id, version, title, body, created_at, editor:profiles!document_versions_edited_by_fkey(id, full_name, email, avatar_url)")
    .eq("document_id", docId)
    .order("version", { ascending: false });
  return (data ?? []) as unknown as { id: string; version: number; title: string; body: string; created_at: string; editor: PersonLite | null }[];
}

export type TopicRow = Topic & { author: PersonLite | null };

export async function getTopics(projectId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("topics")
    .select("*, author:profiles!topics_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .order("pinned", { ascending: false })
    .order("last_activity_at", { ascending: false });
  return (data ?? []) as unknown as TopicRow[];
}

export async function getTopic(id: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("topics")
    .select("*, author:profiles!topics_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as TopicRow | null;
}

export async function getTopicComments(projectId: string, topicId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("comments")
    .select("id, body, is_internal, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .eq("topic_id", topicId)
    .order("created_at");
  return (data ?? []) as unknown as CommentRow[];
}

export type ChatRow = { id: string; body: string; created_at: string; author_id: string; author: PersonLite | null };

export async function getChat(projectId: string, limit = 100) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, body, created_at, author_id, author:profiles!chat_messages_author_id_fkey(id, full_name, email, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as ChatRow[]).reverse();
}

export type EventRow = CalendarEvent & {
  project: { key: string; name: string; color: string } | null;
  attendees: { user_id: string; response: string; profile: PersonLite | null }[];
};

const EVENT_SELECT =
  "*, project:projects(key, name, color), attendees:event_attendees(user_id, response, profile:profiles(id, full_name, email, avatar_url))";

export async function getEvents(filter: { orgId?: string; projectId?: string; from: string; to: string }) {
  const supabase = await getSupabase();
  let q = supabase.from("events").select(EVENT_SELECT).lte("starts_at", filter.to).gte("ends_at", filter.from).order("starts_at");
  if (filter.orgId) q = q.eq("org_id", filter.orgId);
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  const { data } = await q;
  return (data ?? []) as unknown as EventRow[];
}

export async function getEvent(id: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.from("events").select(EVENT_SELECT).eq("id", id).maybeSingle();
  return data as unknown as EventRow | null;
}
