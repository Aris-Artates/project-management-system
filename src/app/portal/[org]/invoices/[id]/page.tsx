import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext, getSupabase, requireFeature } from "@/lib/session";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import type { Invoice, InvoiceItem } from "@/lib/types";

export default async function PortalInvoice({ params }: PageProps<"/portal/[org]/invoices/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await getOrgContext(slug);
  requireFeature(ctx, "invoices");
  const supabase = await getSupabase();
  const [{ data: inv }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*, project:projects(key, name)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position").order("description"),
  ]);
  if (!inv) notFound();
  const invoice = inv as unknown as Invoice & { project: { key: string; name: string } | null };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-3 print:hidden">
        <Link href={`/portal/${slug}/invoices`} className="text-sm text-muted hover:text-fg">
          Invoices
        </Link>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>
      <InvoiceDocument
        invoice={invoice}
        items={(items ?? []) as InvoiceItem[]}
        from={{ name: ctx.org.name, address: ctx.org.billing_address }}
        project={invoice.project}
      />
    </div>
  );
}
