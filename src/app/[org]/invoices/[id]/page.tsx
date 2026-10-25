import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { addInvoiceItem, deleteDraftInvoice, deleteInvoiceItem, saveInvoiceDetails, setInvoiceStatus } from "@/lib/actions/invoices";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { INVOICE_STATUS } from "@/lib/money";
import type { Invoice, InvoiceItem } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await getSupabase();
  const { data } = await supabase.from("invoices").select("number").eq("id", id).maybeSingle();
  return { title: data ? `Invoice ${data.number}` : "Invoice" };
}

export default async function InvoicePage({ params }: PageProps<"/[org]/invoices/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("invoice.manage")) redirect(`/${slug}`);
  const supabase = await getSupabase();
  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*, project:projects(key, name)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position").order("description"),
  ]);
  if (!inv) notFound();
  const invoice = inv as unknown as Invoice & { project: { key: string; name: string } | null };
  const draft = invoice.status === "draft";
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const common = (
    <>
      {h("org_slug", slug)}
      {h("invoice_id", invoice.id)}
    </>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Link href={`/${slug}/invoices`} className="text-sm text-muted hover:text-fg">
            Invoices
          </Link>
          <Badge tone={INVOICE_STATUS[invoice.status].tone}>{INVOICE_STATUS[invoice.status].label}</Badge>
          <span className="ml-auto">
            <PrintButton />
          </span>
        </div>
        <InvoiceDocument
          invoice={invoice}
          items={(items ?? []) as InvoiceItem[]}
          from={{ name: ctx.org.name, address: ctx.org.billing_address }}
          project={invoice.project}
          editableItems={
            draft
              ? (it) => (
                  <form action={deleteInvoiceItem}>
                    {h("id", it.id)}
                    {h("org_slug", slug)}
                    <button className="text-xs text-muted hover:text-danger" aria-label={`Remove ${it.description}`}>
                      ×
                    </button>
                  </form>
                )
              : undefined
          }
        />
        {draft && (
          <Card className="print:hidden">
            <ActionForm action={addInvoiceItem} resetOnSuccess className="flex flex-wrap items-center gap-2 p-3">
              {common}
              <Input name="description" placeholder="Line description" required maxLength={500} className="min-w-56 flex-1" />
              <Input name="quantity" type="number" step={0.01} defaultValue={1} className="w-20" aria-label="Quantity" />
              <Input name="unit_price" type="number" step={0.01} placeholder="Rate" className="w-28" aria-label="Rate" />
              <SubmitButton size="sm" variant="secondary">
                Add line
              </SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4 print:hidden">
        <Card>
          <CardHeader title="Next step" />
          <div className="flex flex-col gap-2 p-4">
            {draft && (
              <ActionForm action={setInvoiceStatus} className="flex flex-col gap-2">
                {common}
                {h("status", "sent")}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="email" defaultChecked={!!invoice.bill_to_email} disabled={!invoice.bill_to_email} className="accent-[var(--brand)]" />
                  Email it to {invoice.bill_to_email || "the client (add an email first)"}
                </label>
                <SubmitButton>Mark as sent</SubmitButton>
                <p className="text-xs text-muted">Sent invoices are locked and appear in the client portal.</p>
              </ActionForm>
            )}
            {invoice.status === "sent" && (
              <ActionForm action={setInvoiceStatus}>
                {common}
                {h("status", "paid")}
                <SubmitButton>Mark as paid</SubmitButton>
              </ActionForm>
            )}
            {(invoice.status === "sent" || invoice.status === "paid") && (
              <ActionForm action={setInvoiceStatus}>
                {common}
                {h("status", "void")}
                <ConfirmButton message="Void this invoice? Its time becomes billable again." variant="ghost">
                  Void invoice
                </ConfirmButton>
              </ActionForm>
            )}
            {draft && (
              <form action={deleteDraftInvoice}>
                {common}
                <ConfirmButton message="Delete this draft? Its time becomes billable again." variant="ghost">
                  Delete draft
                </ConfirmButton>
              </form>
            )}
          </div>
        </Card>
        {draft && (
          <Card>
            <CardHeader title="Details" />
            <ActionForm action={saveInvoiceDetails} className="flex flex-col gap-3 p-4">
              {common}
              <Field label="Bill to">
                <Input name="bill_to_name" defaultValue={invoice.bill_to_name ?? ""} maxLength={200} />
              </Field>
              <Field label="Client email">
                <Input name="bill_to_email" type="email" defaultValue={invoice.bill_to_email ?? ""} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Issued">
                  <Input name="issue_date" type="date" defaultValue={invoice.issue_date} required />
                </Field>
                <Field label="Due">
                  <Input name="due_date" type="date" defaultValue={invoice.due_date ?? ""} />
                </Field>
              </div>
              <Field label="Tax rate (%)">
                <Input name="tax_rate" type="number" min={0} max={100} step={0.01} defaultValue={invoice.tax_rate} />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" defaultValue={invoice.notes ?? ""} rows={3} />
              </Field>
              <SubmitButton size="sm">Save details</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </aside>
    </div>
  );
}
