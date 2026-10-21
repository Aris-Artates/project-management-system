"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";

export async function acceptInvitation(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const token = String(form.get("token") ?? "");
  const { data: slug, error } = await supabase.rpc("accept_invitation", { _token: token });
  if (error) return { error: errorMessage(error) };
  redirect(`/${slug}`);
}
