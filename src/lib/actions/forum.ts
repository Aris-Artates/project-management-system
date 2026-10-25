"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, refreshOrg, str } from "./shared";

export async function createTopic(_: ActionState, form: FormData): Promise<ActionState> {
  const title = z.string().trim().min(1, "Give the topic a title").max(200).safeParse(str(form, "title"));
  if (!title.success) return { error: title.error.issues[0]!.message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topics")
    .insert({
      project_id: str(form, "project_id"),
      title: title.data,
      body: str(form, "body").slice(0, 20000),
      // A hidden "false" pairs with the checkbox, so look for any "true".
      client_visible: form.has("client_visible") ? form.getAll("client_visible").includes("true") : true,
    })
    .select("id")
    .single();
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  redirect(`${str(form, "base")}/${data.id}`);
}

export async function moderateTopic(form: FormData) {
  const supabase = await createClient();
  const field = str(form, "field");
  if (field !== "pinned" && field !== "locked") return;
  await supabase.from("topics").update({ [field]: bool(form, "value") }).eq("id", str(form, "topic_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteTopic(form: FormData) {
  const supabase = await createClient();
  await supabase.from("topics").delete().eq("id", str(form, "topic_id"));
  refreshOrg(str(form, "org_slug"));
  redirect(str(form, "base"));
}

// Chat posts come from the client component, so this returns an error string.
export async function sendChatMessage(projectId: string, body: string) {
  const text = body.trim();
  if (!text) return {};
  if (text.length > 4000) return { error: "Message is too long" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ project_id: projectId, body: text })
    .select("id, body, created_at, author_id")
    .single();
  return error ? { error: errorMessage(error) } : { message: data };
}

export async function deleteChatMessage(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  return error ? errorMessage(error) : null;
}
