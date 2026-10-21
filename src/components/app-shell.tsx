import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";
import { displayName } from "@/lib/session";
import type { Notification, Profile } from "@/lib/types";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "./logo";
import { Avatar, Dot } from "./ui";
import { NavLink, type IconName } from "./nav-link";
import { NotificationBell } from "./notification-bell";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

export function AppShell({
  org,
  orgs,
  profile,
  roleName,
  nav,
  projects,
  notifications,
  searchHref,
  children,
}: {
  org: { name: string; slug: string };
  orgs: { name: string; slug: string; client: boolean }[];
  profile: Profile;
  roleName: string;
  nav: NavItem[];
  projects: { href: string; label: string; color: string }[];
  notifications: Notification[];
  searchHref?: string;
  children: ReactNode;
}) {
  const sidebar = (
    <>
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
          <Logo size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{org.name}</span>
            <span className="block truncate text-xs text-muted">{roleName}</span>
          </span>
          <span className="text-muted">▾</span>
        </summary>
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-line bg-surface p-1 shadow-card">
          {orgs.map((o) => (
            <Link
              key={o.slug}
              href={o.client ? `/portal/${o.slug}` : `/${o.slug}`}
              className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
            >
              {o.name}
            </Link>
          ))}
          <Link href="/orgs" className="block rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2">
            All organizations
          </Link>
          {profile.platform_role && (
            <Link href="/admin" className="block rounded-md px-2 py-1.5 text-sm text-brand hover:bg-surface-2">
              Platform admin
            </Link>
          )}
        </div>
      </details>

      {searchHref && (
        <form action={searchHref} className="mt-3">
          <input
            name="q"
            placeholder="Search tasks and projects"
            className="h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </form>
      )}

      <nav className="mt-4 flex flex-col gap-0.5">
        {nav.map((item) => (
          <NavLink key={item.href} href={item.href} icon={item.icon} exact={item.exact}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {projects.length > 0 && (
        <div className="mt-6">
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted">Projects</p>
          <div className="mt-1 flex flex-col gap-0.5">
            {projects.map((p) => (
              <NavLink key={p.href} href={p.href} leading={<Dot color={p.color} />}>
                {p.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <Avatar name={displayName(profile)} src={profile.avatar_url} />
        <span className="min-w-0 flex-1 truncate text-sm">{displayName(profile)}</span>
        <form action={signOut}>
          <button className="text-xs text-muted hover:text-fg">Sign out</button>
        </form>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-3 lg:flex">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
              <Logo size={24} />
              <span className="max-w-40 truncate">{org.name}</span>
            </summary>
            <div className="absolute left-0 top-10 z-30 flex max-h-[80vh] w-72 flex-col overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-card">
              {sidebar}
            </div>
          </details>
          <span className="hidden text-sm text-muted lg:inline">{APP_NAME}</span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell userId={profile.id} initial={notifications} />
          </div>
        </header>
        <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
