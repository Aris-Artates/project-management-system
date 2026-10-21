import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Permission } from "./permissions";
import type { Organization, Profile, Project, Role } from "./types";

export const getSupabase = cache(createClient);

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, platform_role")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
});

export async function requireProfile(next?: string): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return profile;
}

export type OrgContext = {
  profile: Profile;
  org: Organization;
  role: Role | null; // null for platform admins visiting an org they are not part of
  isPlatformAdmin: boolean;
  isOrgAdmin: boolean;
  isClient: boolean;
  can: (perm: Permission) => boolean;
};

export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const profile = await requireProfile(`/${slug}`);
  const supabase = await getSupabase();

  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).maybeSingle();
  if (!org) notFound();

  const { data: member } = await supabase
    .from("org_members")
    .select("status, role:roles(*)")
    .eq("org_id", org.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  const isPlatformAdmin = profile.platform_role !== null;
  const role = member?.status === "active" ? ((member.role as unknown as Role) ?? null) : null;
  if (!isPlatformAdmin && (!role || org.status !== "active")) {
    redirect(org.status !== "active" ? `/suspended?org=${encodeURIComponent(org.name)}` : "/orgs");
  }

  const isOrgAdmin = isPlatformAdmin || role?.system_key === "org_admin";
  const isClient = !isPlatformAdmin && role?.system_key === "client";
  const perms = new Set(role?.permissions ?? []);

  return {
    profile,
    org: org as Organization,
    role,
    isPlatformAdmin,
    isOrgAdmin,
    isClient,
    can: (perm) => isOrgAdmin || perms.has(perm),
  };
});

export type ProjectContext = OrgContext & {
  project: Project;
  isMember: boolean;
  projectRole: Role | null;
  canProject: (perm: Permission) => boolean;
};

export const getProjectContext = cache(async (slug: string, key: string): Promise<ProjectContext> => {
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("key", key.toUpperCase())
    .maybeSingle();
  if (!project) notFound();

  const { data: membership } = await supabase
    .from("project_members")
    .select("override:roles(*)")
    .eq("project_id", project.id)
    .eq("user_id", ctx.profile.id)
    .maybeSingle();

  const override = (membership?.override as unknown as Role | null) ?? null;
  const effective = new Set((override ?? ctx.role)?.permissions ?? []);

  return {
    ...ctx,
    project: project as Project,
    isMember: !!membership,
    projectRole: override,
    canProject: (perm) => ctx.isOrgAdmin || effective.has(perm),
  };
});

export function displayName(p: { full_name: string | null; email: string } | null | undefined) {
  if (!p) return "Someone";
  return p.full_name || p.email.split("@")[0];
}
