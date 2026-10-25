import type { Permission } from "./permissions";

type Feature = "invoices" | "integrations" | "automation";

export function settingsTabs(slug: string, can: (p: Permission) => boolean, feature: (f: Feature) => boolean = () => true) {
  const base = `/${slug}/settings`;
  return [
    { href: base, label: "General", perm: "org.settings" as const, exact: true },
    { href: `${base}/plan`, label: "Plan", perm: "billing.manage" as const },
    { href: `${base}/invoicing`, label: "Invoicing", perm: "invoice.manage" as const, feature: "invoices" as const },
    { href: `${base}/integrations`, label: "Integrations", perm: "integration.manage" as const, feature: "integrations" as const },
    { href: `${base}/automation`, label: "Automation", perm: "automation.manage" as const, feature: "automation" as const },
    { href: `${base}/audit`, label: "Audit log", perm: "audit.view" as const },
    { href: `${base}/security`, label: "Security", perm: "org.settings" as const },
    { href: `${base}/export`, label: "Export", perm: "org.settings" as const },
  ].filter((t) => can(t.perm) && (!("feature" in t) || !t.feature || feature(t.feature)));
}
