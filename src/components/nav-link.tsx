"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, ChartBar, Clock, Folder, Home, LayoutGrid, Receipt, Settings, Shield, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home,
  folder: Folder,
  calendar: CalendarDays,
  clock: Clock,
  chart: ChartBar,
  trend: TrendingUp,
  grid: LayoutGrid,
  receipt: Receipt,
  users: Users,
  shield: Shield,
  settings: Settings,
} satisfies Record<
  string,
  LucideIcon
>;

export type IconName = keyof typeof ICONS;

export function NavLink({
  href,
  icon,
  leading,
  exact,
  children,
}: {
  href: string;
  icon?: IconName;
  leading?: ReactNode;
  exact?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const Icon = icon ? ICONS[icon] : null;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
        active ? "bg-brand-soft font-medium text-brand" : "text-fg hover:bg-surface-2",
      )}
    >
      {Icon ? <Icon size={16} className={active ? "text-brand" : "text-muted"} /> : leading}
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function TabLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
        active ? "border-brand font-medium text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
