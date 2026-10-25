"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { IMPERSONATOR_COOKIE } from "@/lib/impersonation";
import { bool, str } from "./shared";

async function requireDev() {
  const supabase = await createClient();
  const { data: isDev } = await supabase.rpc("is_platform_dev");
  const { data: auth } = await supabase.auth.getUser();
  if (!isDev || !auth.user) throw new Error("Devs only");
  return { supabase, user: auth.user };
}

// --- Feature flags -----------------------------------------------------------

export async function setFlagEnabled(form: FormData) {
  const { supabase } = await requireDev();
  await supabase.from("feature_flags").update({ enabled: bool(form, "enabled") }).eq("key", str(form, "key"));
  revalidatePath("/", "layout");
}

export async function setFlagOrg(form: FormData) {
  const { supabase } = await requireDev();
  const key = str(form, "key");
  const org = str(form, "org_id");
  const { data } = await supabase.from("feature_flags").select("disabled_orgs").eq("key", key).single();
  const current = new Set<string>((data?.disabled_orgs as string[]) ?? []);
  if (bool(form, "disable")) current.add(org);
  else current.delete(org);
  await supabase.from("feature_flags").update({ disabled_orgs: [...current] }).eq("key", key);
  revalidatePath("/", "layout");
}

// --- Impersonation -----------------------------------------------------------

// Signs the Dev in as another user. Needs SUPABASE_SERVICE_ROLE_KEY. The Dev's
// own session is replaced; ending the session signs out.
export async function startImpersonation(_: ActionState, form: FormData): Promise<ActionState> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Add SUPABASE_SERVICE_ROLE_KEY on the server to use this." };
  }
  let dev: Awaited<ReturnType<typeof requireDev>>;
  try {
    dev = await requireDev();
  } catch {
    return { error: "Devs only" };
  }
  const targetId = str(form, "user_id");
  if (targetId === dev.user.id) return { error: "That is you" };
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, email, platform_role").eq("id", targetId).single();
  if (!target) return { error: "User not found" };
  if (target.platform_role === "dev") return { error: "Devs cannot impersonate other Devs" };

  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: target.email });
  if (error || !link.properties?.hashed_token) return { error: errorMessage(error) };

  await admin.from("audit_log").insert({
    org_id: null,
    actor_id: dev.user.id,
    action: "impersonate",
    target_type: "profiles",
    target_id: target.id,
    target_label: target.email,
    details: { by: dev.user.email },
  });

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (verifyError) return { error: errorMessage(verifyError) };

  const store = await cookies();
  store.set(IMPERSONATOR_COOKIE, JSON.stringify({ email: dev.user.email, as: target.email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/orgs");
}

export async function stopImpersonation() {
  const store = await cookies();
  store.delete(IMPERSONATOR_COOKIE);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?next=/admin/users");
}
