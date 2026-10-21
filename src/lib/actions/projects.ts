"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, optional, refreshOrg, str } from "./shared";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name the project").max(120),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "Key must be 2 to 6 letters or digits, starting with a letter"),
  description: z.string().max(5000).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4f46e5"),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
});

function readProject(form: FormData) {
  return projectSchema.safeParse({
    name: str(form, "name"),
    key: str(form, "key"),
    description: optional(form, "description"),
    color: str(form, "color") || undefined,
    start_date: optional(form, "start_date"),
    end_date: optional(form, "end_date"),
  });
}

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readProject(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  const { error } = await supabase.from("projects").insert({ ...parsed.data, org_id: str(form, "org_id") });
  if (error) return { error: error.code === "23505" ? "That project key is already used" : errorMessage(error) };
  refreshOrg(slug);
  redirect(`/${slug}/projects/${parsed.data.key}`);
}

export async function updateProject(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readProject(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  const { error } = await supabase
    .from("projects")
    .update({ ...parsed.data, status: str(form, "status") || "active" })
    .eq("id", str(form, "project_id"));
  if (error) return { error: error.code === "23505" ? "That project key is already used" : errorMessage(error) };
  refreshOrg(slug);
  if (parsed.data.key !== str(form, "old_key")) redirect(`/${slug}/projects/${parsed.data.key}/settings`);
  return { ok: "Project saved" };
}

export async function deleteProject(form: FormData) {
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  await supabase.from("projects").delete().eq("id", str(form, "project_id"));
  refreshOrg(slug);
  redirect(`/${slug}/projects`);
}

export async function addProjectMember(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const userId = str(form, "user_id");
  if (!userId) return { error: "Pick someone to add" };
  const { error } = await supabase.from("project_members").insert({
    project_id: str(form, "project_id"),
    user_id: userId,
    org_id: str(form, "org_id"),
    role_override_id: optional(form, "role_override_id"),
  });
  if (error) return { error: error.code === "23505" ? "Already on this project" : errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Added" };
}

export async function setProjectRoleOverride(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("project_members")
    .update({ role_override_id: optional(form, "role_override_id") })
    .eq("project_id", str(form, "project_id"))
    .eq("user_id", str(form, "user_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function removeProjectMember(form: FormData) {
  const supabase = await createClient();
  await supabase.from("project_members").delete().eq("project_id", str(form, "project_id")).eq("user_id", str(form, "user_id"));
  refreshOrg(str(form, "org_slug"));
}

// --- Structure: lists, statuses, milestones, tags -----------------------------

const nameSchema = z.string().trim().min(1, "Enter a name").max(80);

export async function addList(_: ActionState, form: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(str(form, "name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_lists")
    .insert({ project_id: str(form, "project_id"), name: name.data, position: Number(str(form, "position") || 99) });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "List added" };
}

export async function deleteList(form: FormData) {
  const supabase = await createClient();
  await supabase.from("task_lists").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function addStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(str(form, "name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  const category = str(form, "category");
  if (!["todo", "in_progress", "done"].includes(category)) return { error: "Pick a category" };
  const supabase = await createClient();
  const { error } = await supabase.from("task_statuses").insert({
    project_id: str(form, "project_id"),
    name: name.data,
    category,
    color: str(form, "color") || "#64748b",
    position: Number(str(form, "position") || 99),
  });
  if (error) return { error: error.code === "23505" ? "That status already exists" : errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Status added" };
}

export async function deleteStatus(form: FormData) {
  const supabase = await createClient();
  await supabase.from("task_statuses").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function addMilestone(_: ActionState, form: FormData): Promise<ActionState> {
  const name = nameSchema.safeParse(str(form, "name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").insert({
    project_id: str(form, "project_id"),
    name: name.data,
    due_date: optional(form, "due_date"),
    client_visible: bool(form, "client_visible"),
  });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Milestone added" };
}

export async function toggleMilestone(form: FormData) {
  const supabase = await createClient();
  await supabase
    .from("milestones")
    .update({ status: str(form, "status") === "done" ? "open" : "done" })
    .eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteMilestone(form: FormData) {
  const supabase = await createClient();
  await supabase.from("milestones").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function addTag(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(1).max(30).safeParse(str(form, "name"));
  if (!name.success) return { error: "Enter a tag name" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ project_id: str(form, "project_id"), name: name.data, color: str(form, "color") || "#0ea5e9" });
  if (error) return { error: error.code === "23505" ? "That tag already exists" : errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Tag added" };
}

export async function deleteTag(form: FormData) {
  const supabase = await createClient();
  await supabase.from("tags").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}
