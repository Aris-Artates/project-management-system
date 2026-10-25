import { redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { settingsTabs } from "@/lib/settings-tabs";
import type { Notification } from "@/lib/types";

export default async function OrgLayout({ children, params }: LayoutProps<"/[org]">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (ctx.isClient) redirect(`/portal/${slug}`);

  const supabase = await getSupabase();
  const [{ data: projects }, { data: notifications }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("key, name, color")
      .eq("org_id", ctx.org.id)
      .neq("status", "archived")
      .order("name")
      .limit(12),
    supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("org_members")
      .select("organization:organizations(name, slug), role:roles(system_key)")
      .eq("user_id", ctx.profile.id)
      .eq("status", "active"),
  ]);

  const orgs = ((memberships ?? []) as unknown as { organization: { name: string; slug: string }; role: { system_key: string | null } }[]).map(
    (m) => ({ ...m.organization, client: m.role.system_key === "client" }),
  );

  const nav = [
    { href: `/${slug}`, label: "My work", icon: "home" as const, exact: true },
    { href: `/${slug}/projects`, label: "Projects", icon: "folder" as const },
    { href: `/${slug}/calendar`, label: "Calendar", icon: "calendar" as const },
    ...(ctx.feature("time")
      ? [
          { href: `/${slug}/timesheet`, label: "Timesheet", icon: "clock" as const },
          { href: `/${slug}/workload`, label: "Workload", icon: "chart" as const },
        ]
      : []),
    ...(ctx.can("report.view") ? [{ href: `/${slug}/reports`, label: "Reports", icon: "trend" as const }] : []),
    ...(ctx.can("report.view") || ctx.can("project.view_all")
      ? [{ href: `/${slug}/portfolio`, label: "Portfolio", icon: "grid" as const }]
      : []),
    { href: `/${slug}/members`, label: "Members", icon: "users" as const },
    ...(ctx.can("role.manage") ? [{ href: `/${slug}/roles`, label: "Roles and access", icon: "shield" as const }] : []),
    ...(ctx.can("invoice.manage") && ctx.feature("invoices") ? [{ href: `/${slug}/invoices`, label: "Invoices", icon: "receipt" as const }] : []),
    ...(settingsTabs(slug, ctx.can, ctx.feature).length ? [{ href: settingsTabs(slug, ctx.can, ctx.feature)[0]!.href, label: "Settings", icon: "settings" as const }] : []),
  ];

  return (
    <AppShell
      org={{ name: ctx.org.name, slug }}
      orgs={orgs}
      profile={ctx.profile}
      roleName={ctx.role?.name ?? "Platform admin"}
      nav={nav}
      projects={(projects ?? []).map((p) => ({ href: `/${slug}/projects/${p.key}`, label: p.name, color: p.color }))}
      notifications={(notifications ?? []) as Notification[]}
      searchHref={`/${slug}/search`}
    >
      {children}
    </AppShell>
  );
}
