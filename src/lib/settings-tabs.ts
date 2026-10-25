import type { Permission } from "./permissions";

export function settingsTabs(slug: string, can: (p: Permission) => boolean) {
  const base = `/${slug}/settings`;
  return [
    { href: base, label: "General", perm: "org.settings" as const, exact: true },
    { href: `${base}/plan`, label: "Plan", perm: "billing.manage" as const },
    { href: `${base}/invoicing`, label: "Invoicing", perm: "invoice.manage" as const },
    { href: `${base}/integrations`, label: "Integrations", perm: "integration.manage" as const },
    { href: `${base}/automation`, label: "Automation", perm: "automation.manage" as const },
    { href: `${base}/audit`, label: "Audit log", perm: "audit.view" as const },
    { href: `${base}/security`, label: "Security", perm: "org.settings" as const },
    { href: `${base}/export`, label: "Export", perm: "org.settings" as const },
  ].filter((t) => can(t.perm));
}
