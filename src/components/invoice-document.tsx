import type { Invoice, InvoiceItem } from "@/lib/types";
import { money } from "@/lib/money";
import { formatDate } from "@/lib/utils";

// The printable invoice. Used by staff and in the client portal.
export function InvoiceDocument({
  invoice,
  items,
  from,
  project,
  editableItems,
}: {
  invoice: Invoice;
  items: InvoiceItem[];
  from: { name: string; address: string | null };
  project: { key: string; name: string } | null;
  editableItems?: (item: InvoiceItem) => React.ReactNode;
}) {
  const fmt = (n: number | string) => money(n, invoice.currency);
  const d = (s: string | null) => (s ? formatDate(s, { month: "short", day: "numeric", year: "numeric" }) : "");
  return (
    <div className="invoice-doc rounded-[var(--radius-card)] border border-line bg-surface p-8 text-sm print:border-0 print:p-0">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-lg font-semibold">{from.name}</p>
          {from.address && <p className="mt-1 whitespace-pre-line text-muted">{from.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight">Invoice</p>
          <p className="font-mono">{invoice.number}</p>
          {invoice.status === "void" && <p className="mt-1 font-semibold text-danger">VOID</p>}
          {invoice.status === "paid" && <p className="mt-1 font-semibold text-success">PAID {d(invoice.paid_at)}</p>}
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Bill to</p>
          <p className="mt-1 font-medium">{invoice.bill_to_name || "Not set"}</p>
          {invoice.bill_to_email && <p className="text-muted">{invoice.bill_to_email}</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Issued</p>
          <p className="mt-1">{d(invoice.issue_date)}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-muted">Due</p>
          <p className="mt-1">{d(invoice.due_date) || "On receipt"}</p>
        </div>
        {project && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Project</p>
            <p className="mt-1">{project.name}</p>
          </div>
        )}
      </div>

      <table className="mt-8 w-full">
        <thead className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 font-medium">Description</th>
            <th className="w-20 py-2 text-right font-medium">Qty</th>
            <th className="w-28 py-2 text-right font-medium">Rate</th>
            <th className="w-32 py-2 text-right font-medium">Amount</th>
            {editableItems && <th className="w-10 print:hidden" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted">
                No lines yet.
              </td>
            </tr>
          )}
          {items.map((it) => (
            <tr key={it.id}>
              <td className="py-2 pr-4">{it.description}</td>
              <td className="py-2 text-right tabular-nums">{Number(it.quantity)}</td>
              <td className="py-2 text-right tabular-nums">{fmt(it.unit_price)}</td>
              <td className="py-2 text-right tabular-nums">{fmt(it.amount)}</td>
              {editableItems && <td className="py-2 text-right print:hidden">{editableItems(it)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto flex w-64 flex-col gap-1 tabular-nums">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span>{fmt(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Tax ({Number(invoice.tax_rate)}%)</span>
          <span>{fmt(invoice.tax_amount)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line-strong pt-2 text-base font-semibold">
          <span>Total</span>
          <span>{fmt(invoice.total)}</span>
        </div>
      </div>

      {invoice.notes && <p className="mt-8 whitespace-pre-line text-muted">{invoice.notes}</p>}
    </div>
  );
}
