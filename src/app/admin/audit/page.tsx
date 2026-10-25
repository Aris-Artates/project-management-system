import Link from "next/link";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/session";
import { AuditList, type AuditRow } from "@/components/audit-list";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

export default async function AdminAudit({ searchParams }: PageProps<"/admin/audit">) {
  const { page } = await searchParams;
  const n = Math.max(0, Number(page) || 0);
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, target_type, target_label, details, created_at, actor:profiles!audit_log_actor_id_fkey(id, full_name, email, avatar_url), org:organizations(name)")
    .order("id", { ascending: false })
    .range(n * PAGE, n * PAGE + PAGE);
  const rows = (data ?? []) as unknown as AuditRow[];
  return (
    <div>
      <PageHeader title="Audit log" description="Every organization, plus platform role changes." />
      <Card>
        <AuditList rows={rows.slice(0, PAGE)} showOrg />
        <div className="flex justify-between border-t border-line px-4 py-2 text-sm">
          {n > 0 ? <Link href={`?page=${n - 1}`}>Newer</Link> : <span />}
          {rows.length > PAGE && <Link href={`?page=${n + 1}`}>Older</Link>}
        </div>
      </Card>
    </div>
  );
}
