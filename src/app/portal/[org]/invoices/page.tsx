import Link from "next/link";
import { getOrgContext, getSupabase } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { INVOICE_STATUS, money } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export default async function PortalInvoices({ params }: PageProps<"/portal/[org]/invoices">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();
  const { data } = await supabase.from("invoices").select("*, project:projects(name)").eq("org_id", ctx.org.id).order("issue_date", { ascending: false });
  const invoices = (data ?? []) as unknown as (Invoice & { project: { name: string } | null })[];
  const today = todayISO();

  return (
    <div>
      <Link href={`/portal/${slug}`} className="text-sm text-muted hover:text-fg">
        All projects
      </Link>
      <PageHeader title="Invoices" />
      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {invoices.map((i) => {
              const late = i.status === "sent" && i.due_date && i.due_date < today;
              return (
                <li key={i.id}>
                  <Link href={`/portal/${slug}/invoices/${i.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="w-24 font-mono text-xs">{i.number}</span>
                    <span className="min-w-0 flex-1 truncate">{i.project?.name}</span>
                    <span className={`text-xs ${late ? "font-medium text-danger" : "text-muted"}`}>
                      {i.status === "sent" ? (late ? "Overdue" : `Due ${formatDate(i.due_date)}`) : ""}
                    </span>
                    <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                    <span className="w-28 text-right font-medium tabular-nums">{money(i.total, i.currency)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
