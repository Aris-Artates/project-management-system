import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, displayName } from "@/lib/session";
import { TabLink } from "@/components/nav-link";
import { Badge } from "@/components/ui";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/lib/brand";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireProfile("/admin");
  if (!profile.platform_role) redirect("/orgs");

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <Logo size={26} /> {APP_NAME}
          </Link>
          <Badge tone="brand">{profile.platform_role === "dev" ? "Dev" : "Super Admin"}</Badge>
          <span className="ml-auto text-sm text-muted">{displayName(profile)}</span>
          <Link href="/orgs" className="text-sm text-brand">
            Exit admin
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          <TabLink href="/admin" exact>
            Organizations
          </TabLink>
          <TabLink href="/admin/users">People</TabLink>
          <TabLink href="/admin/audit">Audit log</TabLink>
          {profile.platform_role === "dev" && <TabLink href="/admin/features">Features</TabLink>}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
