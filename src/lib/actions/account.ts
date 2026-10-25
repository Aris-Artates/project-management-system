"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { optional, str } from "./shared";

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(1, "Enter your name").max(80).safeParse(str(form, "full_name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  const avatar = optional(form, "avatar_url");
  if (avatar && !/^https:\/\//.test(avatar)) return { error: "Photo URL must start with https://" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("profiles").update({ full_name: name.data, avatar_url: avatar }).eq("id", auth.user!.id);
  if (error) return { error: errorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function resetCalendarFeed() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("calendar_feeds").delete().eq("user_id", auth.user.id);
  await supabase.from("calendar_feeds").insert({ user_id: auth.user.id });
  revalidatePath("/account");
}
