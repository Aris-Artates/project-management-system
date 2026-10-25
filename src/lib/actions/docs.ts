"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, optional, refreshOrg, str } from "./shared";

const docSchema = z.object({
  title: z.string().trim().min(1, "Give the page a title").max(200),
  body: z.string().max(200000, "This page is too long"),
});

export async function createDoc(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = docSchema.safeParse({ title: str(form, "title"), body: "" });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({ project_id: str(form, "project_id"), title: parsed.data.title, parent_id: optional(form, "parent_id"), position: Date.now() / 1000 })
    .select("id")
    .single();
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  redirect(`${str(form, "base")}/${data.id}?edit=1`);
}

export async function saveDoc(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = docSchema.safeParse({ title: str(form, "title"), body: String(form.get("body") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const id = str(form, "doc_id");
  // Refuse to overwrite someone else's newer edit.
  const { data: current } = await supabase.from("documents").select("version").eq("id", id).single();
  if (current && String(current.version) !== str(form, "version")) {
    return { error: "Someone saved a newer version while you were editing. Copy your changes, reload, and apply them again." };
  }
  const { error } = await supabase
    .from("documents")
    .update({ ...parsed.data, client_visible: bool(form, "client_visible"), parent_id: optional(form, "parent_id") })
    .eq("id", id);
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  redirect(`${str(form, "base")}/${id}`);
}

export async function restoreDocVersion(form: FormData) {
  const supabase = await createClient();
  const { data: v } = await supabase.from("document_versions").select("title, body, document_id").eq("id", str(form, "version_id")).single();
  if (v) await supabase.from("documents").update({ title: v.title, body: v.body }).eq("id", v.document_id);
  refreshOrg(str(form, "org_slug"));
  redirect(`${str(form, "base")}/${v?.document_id ?? ""}`);
}

export async function deleteDoc(form: FormData) {
  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", str(form, "doc_id"));
  refreshOrg(str(form, "org_slug"));
  redirect(str(form, "base"));
}
