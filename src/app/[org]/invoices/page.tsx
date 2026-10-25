import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { createBlankInvoice, createInvoiceFromTime } from "@/lib/actions/invoices";
import { ActionForm, SubmitButton } from "@/components/form";
import { StatTile } from "@/components/charts";
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { INVOICE_STATUS, money } from "@/lib/money";
import { formatDate, isoInDays, todayISO } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ params, searchParams }: PageProps<"/[org]/invoices">) {
  const { org: slug } = await params;
  const { status } = await searchParams;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("invoice.manage")) redirect(`/${slug}`);
  const supabase = await getSupabase();
  let q = supabase.from("invoices").select("*, project:projects(key, name)").eq("org_id", ctx.org.id).order("created_at", { ascending: false });
  if (typeof status === "string" && status) q = q.eq("status", status);
  const [{ data }, { data: projects }, { data: unbilled }] = await Promise.all([
    q,
    supabase.from("projects").select("id, key, name, billing_type").eq("org_id", ctx.org.id).neq("status", "archived").order("name"),
    supabase.from("time_entries").select("project_id, minutes").eq("org_id", ctx.org.id).eq("status", "approved").eq("billable", true).is("invoice_id", null),
  ]);
  const invoices = (data ?? []) as unknown as (Invoice & { project: { key: string; name: string } | null })[];
  const all = status ? null : invoices;
  const today = todayISO();
  const outstanding = (all ?? []).filter((i) => i.status === "sent");
  const overdue = outstanding.filter((i) => i.due_date && i.due_date < today);
  const unbilledHours = (unbilled ?? []).reduce((s, e) => s + e.minutes, 0) / 60;
  const c = ctx.org.currency;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Invoices" />
      {all && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Outstanding" value={money(outstanding.reduce((s, i) => s + Number(i.total), 0), c)} hint={`${outstanding.length} sent`} />
          <StatTile label="Overdue" value={money(overdue.reduce((s, i) => s + Number(i.total), 0), c)} tone={overdue.length ? "danger" : undefined} hint={`${overdue.length} invoices`} />
          <StatTile
            label="Paid, last 90 days"
            value={money(invoices.filter((i) => i.status === "paid" && i.paid_at && i.paid_at >= isoInDays(-90)).reduce((s, i) => s + Number(i.total), 0), c)}
          />
          <StatTile label="Approved, not billed" value={`${Math.round(unbilledHours * 10) / 10}h`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2 text-sm">
            {["", "draft", "sent", "paid", "void"].map((s) => (
              <Link key={s} href={`?status=${s}`} className={`rounded-md px-2 py-1 capitalize ${(status ?? "") === s ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2"}`}>
                {s || "All"}
              </Link>
            ))}
          </div>
          {invoices.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No invoices yet">Create one from approved time on the right.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {invoices.map((i) => {
                const late = i.status === "sent" && i.due_date && i.due_date < today;
                return (
                  <li key={i.id}>
                    <Link href={`/${slug}/invoices/${i.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                      <span className="w-24 font-mono text-xs">{i.number}</span>
                      <span className="min-w-0 flex-1 truncate">{i.bill_to_name || i.project?.name || "No client"}</span>
                      <span className="text-xs text-muted">{i.project?.key}</span>
                      <span className={`w-24 text-xs ${late ? "font-medium text-danger" : "text-muted"}`}>{late ? "Overdue" : i.due_date ? `Due ${formatDate(i.due_date)}` : ""}</span>
                      <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                      <span className="w-28 text-right font-medium tabular-nums">{money(i.total, i.currency)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Bill approved time" description="Approved, billable time that has not been invoiced yet." />
            <ActionForm action={createInvoiceFromTime} className="flex flex-col gap-3 p-4">
              <input type="hidden" name="org_slug" value={slug} />
              <Field label="Project">
                <Select name="project_id" required>
                  {(projects ?? [])
                    .filter((p) => p.billing_type !== "none")
                    .map((p) => {
                      const h = (unbilled ?? []).filter((e) => e.project_id === p.id).reduce((s, e) => s + e.minutes, 0) / 60;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.key} {p.name} ({Math.round(h * 10) / 10}h ready)
                        </option>
                      );
                    })}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <Input name="from" type="date" defaultValue={isoInDays(-30)} required />
                </Field>
                <Field label="To">
                  <Input name="to" type="date" defaultValue={today} required />
                </Field>
              </div>
              <Field label="One line per">
                <Select name="group" defaultValue="person">
                  <option value="person">Person</option>
                  <option value="task">Task</option>
                  <option value="entry">Time entry</option>
                </Select>
              </Field>
              <SubmitButton pendingText="Creating...">Create draft invoice</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Blank invoice" description="For fixed fees or expenses." />
            <ActionForm action={createBlankInvoice} className="flex flex-col gap-3 p-4">
              <input type="hidden" name="org_slug" value={slug} />
              <input type="hidden" name="org_id" value={ctx.org.id} />
              <Select name="project_id" defaultValue="">
                <option value="">No project</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} {p.name}
                  </option>
                ))}
              </Select>
              <SubmitButton variant="secondary">Create blank invoice</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
