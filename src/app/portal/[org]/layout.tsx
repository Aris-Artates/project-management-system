import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { signOut } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/notification-bell";
import { Avatar } from "@/components/ui";
import { Logo } from "@/components/logo";
import type { Notification } from "@/lib/types";

export default async function PortalLayout({ children, params }: LayoutProps<"/portal/[org]">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.isClient) redirect(`/${slug}`);
  const supabase = await getSupabase();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href={`/portal/${slug}`} className="flex items-center gap-2 font-semibold">
            {ctx.org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.org.logo_url} alt="" className="size-7 rounded-md object-cover" />
            ) : (
              <Logo size={26} />
            )}
            <span className="truncate">{ctx.org.name}</span>
          </Link>
          <span className="hidden rounded-md bg-ember-soft px-1.5 py-0.5 text-xs font-medium text-ember sm:inline">Client portal</span>
          <div className="ml-auto flex items-center gap-2">
            {ctx.feature("invoices") && (
              <Link href={`/portal/${slug}/invoices`} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                Invoices
              </Link>
            )}
            <NotificationBell userId={ctx.profile.id} initial={(notifications ?? []) as Notification[]} />
            <Avatar name={displayName(ctx.profile)} src={ctx.profile.avatar_url} />
            <form action={signOut}>
              <button className="text-xs text-muted hover:text-fg">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
