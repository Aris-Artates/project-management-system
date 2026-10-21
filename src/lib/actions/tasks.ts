"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { sendNotificationEmail } from "@/lib/email";
import { PRIORITIES } from "@/lib/utils";
import { bool, optional, refreshOrg, str } from "./shared";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const taskFields = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(300),
  description: z.string().max(20000).nullable(),
  list_id: z.uuid().nullable(),
  status_id: z.uuid().nullable(),
  milestone_id: z.uuid().nullable(),
  priority: z.enum(PRIORITIES),
  start_date: date,
  due_date: date,
  estimate_hours: z.coerce.number().min(0).max(10000).nullable(),
  client_visible: z.boolean(),
});

function readTaskFields(form: FormData) {
  return taskFields.safeParse({
    title: str(form, "title"),
    description: optional(form, "description"),
    list_id: optional(form, "list_id"),
    status_id: optional(form, "status_id"),
    milestone_id: optional(form, "milestone_id"),
    priority: str(form, "priority") || "none",
    start_date: optional(form, "start_date"),
    due_date: optional(form, "due_date"),
    estimate_hours: optional(form, "estimate_hours"),
    client_visible: bool(form, "client_visible"),
  });
}

async function emailAssignee(userId: string, taskId: string) {
  const supabase = await createClient();
  const [{ data: person }, { data: link }, { data: ref }] = await Promise.all([
    supabase.from("profiles").select("email").eq("id", userId).single(),
    supabase.rpc("task_link", { _task: taskId }),
    supabase.rpc("task_ref", { _task: taskId }),
  ]);
  if (person?.email) await sendNotificationEmail(person.email, `Assigned to you: ${ref ?? "a task"}`, null, link);
}

export async function createTask(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readTaskFields(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const projectId = str(form, "project_id");
  const assignee = optional(form, "assignee_id");
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      ...parsed.data,
      project_id: projectId,
      parent_id: optional(form, "parent_id"),
      position: Date.now() / 1000,
    })
    .select("id")
    .single();
  if (error) return { error: errorMessage(error) };

  if (assignee) {
    const { error: aErr } = await supabase.from("task_assignees").insert({ task_id: task.id, user_id: assignee });
    if (!aErr) await emailAssignee(assignee, task.id);
  }
  refreshOrg(str(form, "org_slug"));
  return { ok: "Task added" };
}

export async function updateTask(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readTaskFields(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(parsed.data).eq("id", str(form, "task_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}

// Small single-field updates from selects and the board.
export async function patchTask(form: FormData) {
  const supabase = await createClient();
  const field = str(form, "field");
  const allowed = ["status_id", "priority", "due_date", "list_id", "milestone_id"];
  if (!allowed.includes(field)) return;
  await supabase.from("tasks").update({ [field]: optional(form, "value") }).eq("id", str(form, "task_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function moveTask(taskId: string, statusId: string, position: number, orgSlug: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status_id: statusId, position }).eq("id", taskId);
  refreshOrg(orgSlug);
  return error ? errorMessage(error) : null;
}

export async function toggleTaskDone(form: FormData) {
  const supabase = await createClient();
  const taskId = str(form, "task_id");
  const { data: task } = await supabase.from("tasks").select("project_id, completed_at").eq("id", taskId).single();
  if (!task) return;
  const { data: statuses } = await supabase
    .from("task_statuses")
    .select("id, category, position")
    .eq("project_id", task.project_id)
    .order("position");
  const target = task.completed_at
    ? statuses?.find((s) => s.category === "todo")
    : statuses?.find((s) => s.category === "done");
  if (target) await supabase.from("tasks").update({ status_id: target.id }).eq("id", taskId);
  refreshOrg(str(form, "org_slug"));
}

export async function deleteTask(form: FormData) {
  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", str(form, "task_id"));
  refreshOrg(str(form, "org_slug"));
  const to = str(form, "redirect_to");
  if (to.startsWith("/") && !to.startsWith("//")) redirect(to);
}

export async function addAssignee(form: FormData) {
  const supabase = await createClient();
  const taskId = str(form, "task_id");
  const userId = str(form, "user_id");
  if (!userId) return;
  const { error } = await supabase.from("task_assignees").insert({ task_id: taskId, user_id: userId });
  if (!error) await emailAssignee(userId, taskId);
  refreshOrg(str(form, "org_slug"));
}

export async function removeAssignee(form: FormData) {
  const supabase = await createClient();
  await supabase.from("task_assignees").delete().eq("task_id", str(form, "task_id")).eq("user_id", str(form, "user_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function toggleTag(form: FormData) {
  const supabase = await createClient();
  const taskId = str(form, "task_id");
  const tagId = str(form, "tag_id");
  if (bool(form, "on")) {
    await supabase.from("task_tags").insert({ task_id: taskId, tag_id: tagId });
  } else {
    await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tagId);
  }
  refreshOrg(str(form, "org_slug"));
}

// Clients approve work that is waiting on them: moves it to the first done status.
export async function approveTask(form: FormData) {
  const supabase = await createClient();
  await supabase.rpc("client_approve_task", { _task: str(form, "task_id") });
  refreshOrg(str(form, "org_slug"));
}
