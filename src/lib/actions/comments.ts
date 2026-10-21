"use server";

import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { sendNotificationEmail } from "@/lib/email";
import { bool, optional, refreshOrg, str } from "./shared";

// "@diego" or "@diego.dev" matches a project member by first name or email name.
function findMentions(body: string, people: { id: string; full_name: string | null; email: string }[]) {
  const tokens = [...body.matchAll(/@([a-z0-9._-]{2,})/gi)].map((m) => m[1]!.toLowerCase());
  if (!tokens.length) return [];
  const ids = new Set<string>();
  for (const t of tokens) {
    for (const p of people) {
      const local = p.email.split("@")[0]!.toLowerCase();
      const first = (p.full_name ?? "").split(" ")[0]!.toLowerCase();
      const joined = (p.full_name ?? "").replace(/\s+/g, "").toLowerCase();
      if (t === local || t === first || t === joined) ids.add(p.id);
    }
  }
  return [...ids];
}

export async function addComment(_: ActionState, form: FormData): Promise<ActionState> {
  const body = str(form, "body");
  if (!body) return { error: "Write something first" };
  if (body.length > 10000) return { error: "Comment is too long" };

  const supabase = await createClient();
  const projectId = str(form, "project_id");
  const taskId = optional(form, "task_id");

  const { data: members } = await supabase
    .from("project_members")
    .select("profile:profiles!project_members_user_id_fkey(id, full_name, email)")
    .eq("project_id", projectId);
  const people = ((members ?? []) as unknown as { profile: { id: string; full_name: string | null; email: string } }[]).map(
    (m) => m.profile,
  );
  const mentions = findMentions(body, people);

  const { error } = await supabase.from("comments").insert({
    project_id: projectId,
    task_id: taskId,
    body,
    is_internal: bool(form, "is_internal"),
    mentions,
  });
  if (error) return { error: errorMessage(error) };

  const { data: me } = await supabase.auth.getUser();
  const link = taskId ? (await supabase.rpc("task_link", { _task: taskId })).data : null;
  for (const p of people.filter((p) => mentions.includes(p.id) && p.id !== me.user?.id)) {
    await sendNotificationEmail(p.email, "You were mentioned in a comment", body.slice(0, 280), link);
  }

  refreshOrg(str(form, "org_slug"));
  return { ok: "Posted" };
}

export async function deleteComment(form: FormData) {
  const supabase = await createClient();
  await supabase.from("comments").delete().eq("id", str(form, "comment_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteAttachment(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "attachment_id");
  const { data } = await supabase.from("attachments").select("storage_path").eq("id", id).single();
  if (!data) return;
  // Object first: its delete policy looks up the attachment row.
  await supabase.storage.from("attachments").remove([data.storage_path]);
  await supabase.from("attachments").delete().eq("id", id);
  refreshOrg(str(form, "org_slug"));
}

export async function setAttachmentVisibility(form: FormData) {
  const supabase = await createClient();
  await supabase.from("attachments").update({ client_visible: bool(form, "client_visible") }).eq("id", str(form, "attachment_id"));
  refreshOrg(str(form, "org_slug"));
}
