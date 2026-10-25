import { displayName } from "@/lib/session";
import type { PersonLite } from "@/lib/types";
import { Badge } from "./ui";
import { LocalTime } from "./local-time";

export type AuditRow = {
  id: number;
  action: string;
  target_type: string;
  target_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: PersonLite | null;
  org?: { name: string } | null;
};

const TARGET: Record<string, string> = {
  roles: "Role",
  org_members: "Member",
  invitations: "Invitation",
  organizations: "Organization",
  projects: "Project",
  api_keys: "API key",
  webhooks: "Webhook",
  integrations: "Integration",
  automation_rules: "Automation rule",
  profiles: "Platform role",
  member_rates: "Rate",
};

function short(v: unknown) {
  if (v === null || v === undefined) return "none";
  if (Array.isArray(v)) return v.length > 6 ? `${v.slice(0, 6).join(", ")} +${v.length - 6}` : v.join(", ") || "none";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}

export function AuditList({ rows, showOrg = false }: { rows: AuditRow[]; showOrg?: boolean }) {
  if (!rows.length) return <p className="p-4 text-sm text-muted">Nothing recorded yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const changes =
          r.action === "update"
            ? Object.entries(r.details as Record<string, { from: unknown; to: unknown }>)
            : [];
        return (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={r.action === "delete" ? "danger" : r.action === "insert" ? "success" : "neutral"}>
                {r.action === "insert" ? "Added" : r.action === "delete" ? "Removed" : "Changed"}
              </Badge>
              <span className="font-medium">{TARGET[r.target_type] ?? r.target_type}</span>
              {r.target_label && <span className="truncate">{r.target_label}</span>}
              {showOrg && r.org && <span className="text-muted">in {r.org.name}</span>}
              <span className="ml-auto text-xs text-muted">
                {r.actor ? displayName(r.actor) : "System"} · <LocalTime iso={r.created_at} />
              </span>
            </div>
            {changes.length > 0 && (
              <ul className="pl-1 text-xs text-muted">
                {changes.slice(0, 6).map(([k, v]) => (
                  <li key={k}>
                    <span className="text-fg">{k.replace(/_/g, " ")}</span>: {short(v?.from)} → {short(v?.to)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
