"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, optional, refreshOrg, str } from "./shared";

// Accepts "1:30", "1h 30m", "90m", "1.5" (hours) or "90" (minutes when > 12).
function parseDuration(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(v);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(v);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 12 ? Math.round(n) : Math.round(n * 60);
}

export async function logTime(_: ActionState, form: FormData): Promise<ActionState> {
  const minutes = parseDuration(str(form, "duration"));
  if (!minutes || minutes > 1440) return { error: "Enter a duration like 1:30, 45m or 2h" };
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(str(form, "work_date"));
  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    project_id: str(form, "project_id"),
    task_id: optional(form, "task_id"),
    bug_id: optional(form, "bug_id"),
    minutes,
    work_date: date.success ? date.data : undefined,
    note: optional(form, "note"),
    billable: form.has("billable") ? bool(form, "billable") : true,
  });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Time logged" };
}

export async function deleteTimeEntry(form: FormData) {
  const supabase = await createClient();
  await supabase.from("time_entries").delete().eq("id", str(form, "entry_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function startTimer(form: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  // Starting a new timer stops the old one and keeps its time.
  await stopRunningTimer(supabase, auth.user.id);
  await supabase.from("timers").insert({
    user_id: auth.user.id,
    project_id: str(form, "project_id"),
    task_id: optional(form, "task_id"),
    bug_id: optional(form, "bug_id"),
  });
  refreshOrg(str(form, "org_slug"));
}

export async function stopTimer(form: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await stopRunningTimer(supabase, auth.user.id);
  refreshOrg(str(form, "org_slug"));
}

async function stopRunningTimer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: timer } = await supabase.from("timers").select("*").eq("user_id", userId).maybeSingle();
  if (!timer) return;
  const minutes = Math.min(1440, Math.max(1, Math.round((Date.now() - new Date(timer.started_at).getTime()) / 60000)));
  await supabase.from("time_entries").insert({
    project_id: timer.project_id,
    task_id: timer.task_id,
    bug_id: timer.bug_id,
    minutes,
    note: timer.note,
    work_date: new Date(timer.started_at).toISOString().slice(0, 10),
  });
  await supabase.from("timers").delete().eq("user_id", userId);
}

// Submit every draft or rejected entry in a date range for approval.
export async function submitWeek(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("time_entries")
    .update({ status: "submitted" })
    .eq("user_id", auth.user!.id)
    .in("status", ["draft", "rejected"])
    .gte("work_date", str(form, "from"))
    .lte("work_date", str(form, "to"))
    .select("id");
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: data.length ? `Submitted ${data.length} entr${data.length === 1 ? "y" : "ies"}` : "Nothing to submit" };
}

// Separate actions per button: a server-action button does not send its own
// name/value, so one shared action could not tell approve from reject.
async function reviewTime(form: FormData, status: "approved" | "rejected") {
  const supabase = await createClient();
  const ids = form.getAll("entry_id").map(String);
  if (ids.length) await supabase.from("time_entries").update({ status }).in("id", ids).eq("status", "submitted");
  refreshOrg(str(form, "org_slug"));
}

export async function approveTime(form: FormData) {
  await reviewTime(form, "approved");
}

export async function rejectTime(form: FormData) {
  await reviewTime(form, "rejected");
}
