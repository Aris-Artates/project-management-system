"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { sendInvitationEmail } from "@/lib/email";
import { slugify } from "@/lib/utils";
import { str } from "./shared";

const orgSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: z.string().transform(slugify).refine((s) => s.length > 0, "Choose a URL"),
  admin_email: z.email("Enter the Org Admin's email").transform((v) => v.toLowerCase()),
});

export async function adminCreateOrganization(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = orgSchema.safeParse({
    name: str(form, "name"),
    slug: str(form, "slug") || str(form, "name"),
    admin_email: str(form, "admin_email"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("admin_create_organization", {
    _name: parsed.data.name,
    _slug: parsed.data.slug,
    _admin_email: parsed.data.admin_email,
  });
  if (error) return { error: error.code === "23505" ? "That URL is already taken" : errorMessage(error) };

  await sendInvitationEmail({
    to: parsed.data.admin_email,
    orgName: parsed.data.name,
    inviter: "The platform team",
    roleName: "Org Admin",
    token: token as string,
    isClient: false,
  });
  revalidatePath("/admin", "layout");
  return { ok: `Created ${parsed.data.name} and invited ${parsed.data.admin_email}` };
}

export async function adminSetOrgStatus(form: FormData) {
  const supabase = await createClient();
  await supabase.rpc("admin_set_org_status", { _org: str(form, "org_id"), _status: str(form, "status") });
  revalidatePath("/admin", "layout");
}

export async function adminDeleteOrganization(form: FormData) {
  const supabase = await createClient();
  await supabase.rpc("admin_delete_organization", { _org: str(form, "org_id") });
  revalidatePath("/admin", "layout");
}

export async function adminSetPlatformRole(_: ActionState, form: FormData): Promise<ActionState> {
  const role = str(form, "platform_role");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_platform_role", {
    _user: str(form, "user_id"),
    _role: role === "dev" || role === "super_admin" ? role : null,
  });
  if (error) return { error: errorMessage(error) };
  revalidatePath("/admin", "layout");
  return null;
}
