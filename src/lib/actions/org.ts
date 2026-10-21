"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { sendInvitationEmail } from "@/lib/email";
import { PERMISSIONS } from "@/lib/permissions";
import { displayName } from "@/lib/session";
import { refreshOrg, str } from "./shared";

// --- Invitations --------------------------------------------------------------

export async function inviteMember(_: ActionState, form: FormData): Promise<ActionState> {
  const email = z.email().safeParse(str(form, "email").toLowerCase());
  if (!email.success) return { error: "Enter a valid email" };
  const orgId = str(form, "org_id");
  const roleId = str(form, "role_id");
  const projectIds = form.getAll("project_ids").map(String).filter(Boolean);

  const supabase = await createClient();
  const [{ data: role }, { data: org }, { data: auth }] = await Promise.all([
    supabase.from("roles").select("name, system_key").eq("id", roleId).single(),
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase.auth.getUser(),
  ]);
  if (!role || !org) return { error: "Pick a role" };
  if (role.system_key === "client" && projectIds.length === 0) return { error: "Choose at least one project for the client" };

  const { data: existing } = await supabase
    .from("org_members")
    .select("user_id, profile:profiles!org_members_user_id_fkey(email)")
    .eq("org_id", orgId);
  if ((existing ?? []).some((m) => (m.profile as unknown as { email: string } | null)?.email === email.data)) {
    return { error: "That person is already a member. Add them to projects from the project settings." };
  }

  const { data: invite, error } = await supabase
    .from("invitations")
    .insert({ org_id: orgId, email: email.data, role_id: roleId, project_ids: projectIds })
    .select("token")
    .single();
  if (error) return { error: errorMessage(error) };

  const { data: me } = await supabase.from("profiles").select("full_name, email").eq("id", auth.user!.id).single();
  await sendInvitationEmail({
    to: email.data,
    orgName: org.name,
    inviter: displayName(me),
    roleName: role.name,
    token: invite.token,
    isClient: role.system_key === "client",
  });
  refreshOrg(str(form, "org_slug"));
  return { ok: `Invitation sent to ${email.data}` };
}

export async function revokeInvitation(form: FormData) {
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

// --- Members ------------------------------------------------------------------

export async function setMemberStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ status: str(form, "status") === "active" ? "active" : "deactivated" })
    .eq("org_id", str(form, "org_id"))
    .eq("user_id", str(form, "user_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return null;
}

export async function updateMemberRole(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .update({ role_id: str(form, "role_id") })
    .eq("org_id", str(form, "org_id"))
    .eq("user_id", str(form, "user_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return null;
}

// --- Roles --------------------------------------------------------------------

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name the role").max(40),
  description: z.string().trim().max(200).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  permissions: z.array(z.enum(PERMISSIONS)),
});

function readRole(form: FormData) {
  return roleSchema.safeParse({
    name: str(form, "name"),
    description: str(form, "description") || null,
    color: str(form, "color") || "#6366f1",
    permissions: form.getAll("permissions").map(String),
  });
}

export async function createRole(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readRole(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  const { data, error } = await supabase
    .from("roles")
    .insert({ ...parsed.data, org_id: str(form, "org_id"), position: 100 })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "A role with that name exists" : errorMessage(error) };
  refreshOrg(slug);
  redirect(`/${slug}/roles/${data.id}`);
}

export async function updateRole(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = readRole(form);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const systemKey = str(form, "system_key");
  // Preset roles keep their name; the database enforces this too.
  const patch = systemKey ? { description: parsed.data.description, color: parsed.data.color, permissions: parsed.data.permissions } : parsed.data;
  const { error } = await supabase.from("roles").update(patch).eq("id", str(form, "role_id"));
  if (error) return { error: error.code === "23505" ? "A role with that name exists" : errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Role saved. Changes apply on everyone's next action." };
}

export async function duplicateRole(form: FormData) {
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  const { data: role } = await supabase.from("roles").select("*").eq("id", str(form, "role_id")).single();
  if (!role || role.system_key) return;
  let name = `${role.name} copy`;
  for (let i = 2; i < 20; i++) {
    const { count } = await supabase.from("roles").select("id", { count: "exact", head: true }).eq("org_id", role.org_id).eq("name", name);
    if (!count) break;
    name = `${role.name} copy ${i}`;
  }
  const { data } = await supabase
    .from("roles")
    .insert({ org_id: role.org_id, name, description: role.description, color: role.color, position: role.position + 1, permissions: role.permissions })
    .select("id")
    .single();
  refreshOrg(slug);
  if (data) redirect(`/${slug}/roles/${data.id}`);
}

export async function deleteRole(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "org_slug");
  const roleId = str(form, "role_id");
  const { count } = await supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("role_id", roleId);
  if (count) return { error: `Move the ${count} member${count === 1 ? "" : "s"} with this role to another role first` };
  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) return { error: errorMessage(error) };
  refreshOrg(slug);
  redirect(`/${slug}/roles`);
}

// --- Organization -------------------------------------------------------------

export async function updateOrganization(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(2).max(80).safeParse(str(form, "name"));
  if (!name.success) return { error: "Name must be 2 to 80 characters" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: name.data, logo_url: str(form, "logo_url") || null })
    .eq("id", str(form, "org_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}
