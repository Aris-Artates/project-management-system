"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { BUG_STATUSES } from "@/lib/bug-meta";
import { bool, optional, refreshOrg, str } from "./shared";

const SEVERITIES = ["minor", "major", "critical", "blocker"] as const;
const REPRO = ["always", "sometimes", "rarely", "unable"] as const;

const bugFields = z.object({
  title: z.string().trim().min(1, "Give the bug a title").max(300),
  description: z.string().max(20000).nullable(),
  steps: z.string().max(20000).nullable(),
  environment: z.string().max(500).nullable(),
  severity: z.enum(SEVERITIES),
  reproducibility: z.enum(REPRO),
});

function readBug(form: FormData) {
  return bugFields.safeParse({
    title: str(form, "title"),
    description: optional(form, "description"),
    steps: optional(form, "steps"),
    environment: optional(form, "environment"),
    severity: str(form, "severity") || "major",
    reproducibility: str(form, "reproducibility") || "always",
  });
}

export async function reportBug(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readBug(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bugs")
    .insert({
      ...parsed.data,
      project_id: str(form, "project_id"),
      assignee_id: optional(form, "assignee_id"),
      task_id: optional(form, "task_id"),
      client_visible: bool(form, "client_visible"),
    })
    .select("number")
    .single();
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  const base = str(form, "redirect_base");
  if (base.startsWith("/") && !base.startsWith("//")) redirect(`${base}/${data.number}`);
  return { ok: "Bug reported" };
}

export async function updateBug(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readBug(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bugs")
    .update({
      ...parsed.data,
      assignee_id: optional(form, "assignee_id"),
      task_id: optional(form, "task_id"),
      milestone_id: optional(form, "milestone_id"),
      client_visible: bool(form, "client_visible"),
    })
    .eq("id", str(form, "bug_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}

export async function setBugStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const status = str(form, "status");
  if (!(BUG_STATUSES as string[]).includes(status)) return { error: "Unknown status" };
  const supabase = await createClient();
  const { error } = await supabase.from("bugs").update({ status }).eq("id", str(form, "bug_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return null;
}

export async function deleteBug(form: FormData) {
  const supabase = await createClient();
  await supabase.from("bugs").delete().eq("id", str(form, "bug_id"));
  refreshOrg(str(form, "org_slug"));
  const to = str(form, "redirect_to");
  if (to.startsWith("/") && !to.startsWith("//")) redirect(to);
}
