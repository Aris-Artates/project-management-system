import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { AuditList, type AuditRow } from "@/components/audit-list";
import { Card, CardHeader } from "@/components/ui";

const PAGE = 50;

export default async function AuditPage({ params, searchParams }: PageProps<"/[org]/settings/audit">) {
  const { org: slug } = await params;
  const { page, type } = await searchParams;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("audit.view")) redirect(`/${slug}/settings`);
  const n = Math.max(0, Number(page) || 0);
  const supabase = await getSupabase();
  let q = supabase
    .from("audit_log")
    .select("id, action, target_type, target_label, details, created_at, actor:profiles!audit_log_actor_id_fkey(id, full_name, email, avatar_url)")
    .eq("org_id", ctx.org.id)
    .order("id", { ascending: false })
    .range(n * PAGE, n * PAGE + PAGE);
  if (typeof type === "string" && type) q = q.eq("target_type", type);
  const { data } = await q;
  const rows = (data ?? []) as unknown as AuditRow[];
  const types: [string, string][] = [
    ["", "Everything"],
    ["roles", "Roles"],
    ["org_members", "Members"],
    ["invitations", "Invitations"],
    ["organizations", "Organization"],
    ["api_keys", "API keys"],
    ["webhooks", "Webhooks"],
    ["automation_rules", "Automation"],
  ];

  return (
    <Card>
      <CardHeader title="Audit log" description="Changes to access, settings and integrations. Entries cannot be edited or deleted." />
      <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2 text-sm">
        {types.map(([v, l]) => (
          <Link
            key={v}
            href={`?type=${v}`}
            className={`rounded-md px-2 py-1 ${(type ?? "") === v ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <AuditList rows={rows.slice(0, PAGE)} />
      <div className="flex justify-between border-t border-line px-4 py-2 text-sm">
        {n > 0 ? <Link href={`?type=${type ?? ""}&page=${n - 1}`}>Newer</Link> : <span />}
        {rows.length > PAGE && <Link href={`?type=${type ?? ""}&page=${n + 1}`}>Older</Link>}
      </div>
    </Card>
  );
}
