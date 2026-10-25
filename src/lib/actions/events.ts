"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, optional, refreshOrg, str } from "./shared";

// Dates arrive as local "YYYY-MM-DDTHH:mm" plus the browser's UTC offset in minutes.
function toUtc(local: string, offsetMin: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local);
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0)) + offsetMin * 60000;
  return new Date(ms).toISOString();
}

export async function saveEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const title = z.string().trim().min(1, "Give the event a title").max(200).safeParse(str(form, "title"));
  if (!title.success) return { error: title.error.issues[0]!.message };
  const allDay = bool(form, "all_day");
  const offset = Number(str(form, "tz_offset") || 0);
  const startLocal = str(form, "starts_at");
  const endLocal = str(form, "ends_at") || startLocal;
  const starts = toUtc(allDay ? startLocal.slice(0, 10) : startLocal, offset);
  let ends = toUtc(allDay ? endLocal.slice(0, 10) : endLocal, offset);
  if (!starts || !ends) return { error: "Pick a start and end time" };
  if (allDay) ends = new Date(new Date(ends).getTime() + 86400000 - 60000).toISOString();
  if (ends < starts) return { error: "The event ends before it starts" };

  const supabase = await createClient();
  const fields = {
    title: title.data,
    description: optional(form, "description"),
    location: optional(form, "location"),
    starts_at: starts,
    ends_at: ends,
    all_day: allDay,
    client_visible: bool(form, "client_visible"),
  };
  const eventId = str(form, "event_id");
  let id = eventId;
  if (eventId) {
    const { error } = await supabase.from("events").update(fields).eq("id", eventId);
    if (error) return { error: errorMessage(error) };
  } else {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...fields, org_id: str(form, "org_id"), project_id: optional(form, "project_id") })
      .select("id")
      .single();
    if (error) return { error: errorMessage(error) };
    id = data.id;
  }

  const invite = form.getAll("attendees").map(String).filter(Boolean);
  const { data: auth } = await supabase.auth.getUser();
  const wanted = new Set([...invite, ...(eventId ? [] : [auth.user!.id])]);
  if (wanted.size) {
    const { data: existing } = await supabase.from("event_attendees").select("user_id").eq("event_id", id);
    const have = new Set((existing ?? []).map((a) => a.user_id));
    const rows = [...wanted].filter((u) => !have.has(u)).map((user_id) => ({ event_id: id, user_id }));
    if (rows.length) {
      const { error } = await supabase.from("event_attendees").insert(rows);
      if (error) return { error: errorMessage(error) };
    }
  }
  refreshOrg(str(form, "org_slug"));
  redirect(`/${str(form, "org_slug")}/events/${id}`);
}

export async function respondToEvent(form: FormData) {
  const supabase = await createClient();
  const response = str(form, "response");
  if (!["yes", "maybe", "no"].includes(response)) return;
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("event_attendees").update({ response }).eq("event_id", str(form, "event_id")).eq("user_id", auth.user!.id);
  refreshOrg(str(form, "org_slug"));
}

export async function removeAttendee(form: FormData) {
  const supabase = await createClient();
  await supabase.from("event_attendees").delete().eq("event_id", str(form, "event_id")).eq("user_id", str(form, "user_id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteEvent(form: FormData) {
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", str(form, "event_id"));
  refreshOrg(str(form, "org_slug"));
  redirect(`/${str(form, "org_slug")}/calendar`);
}
