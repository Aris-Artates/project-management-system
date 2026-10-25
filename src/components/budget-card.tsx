import { Card, CardHeader } from "./ui";
import { money } from "@/lib/money";

export type Financials = {
  budget_amount: number | null;
  budget_hours: number | null;
  logged_hours: number;
  billable_hours: number;
  billable_value: number;
  invoiced_amount: number;
  paid_amount: number;
  currency: string;
};

function Bar({ label, value, max, text }: { label: string; value: number; max: number | null; text: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const over = !!max && value > max;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={`tabular-nums ${over ? "font-medium text-danger" : "text-muted"}`}>{text}</span>
      </div>
      {max ? (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${over ? "bg-danger" : pct > 80 ? "bg-warning" : "bg-[var(--series-1)]"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

// Budget burn for people with budget.view.
export function BudgetCard({ f }: { f: Financials }) {
  const c = f.currency;
  return (
    <Card>
      <CardHeader title="Budget" />
      <div className="flex flex-col gap-4 p-4">
        <Bar
          label="Hours"
          value={Number(f.logged_hours)}
          max={f.budget_hours ? Number(f.budget_hours) : null}
          text={`${Number(f.logged_hours)}h${f.budget_hours ? ` of ${Number(f.budget_hours)}h` : " logged"}`}
        />
        <Bar
          label="Billable value"
          value={Number(f.billable_value)}
          max={f.budget_amount ? Number(f.budget_amount) : null}
          text={`${money(f.billable_value, c)}${f.budget_amount ? ` of ${money(f.budget_amount, c)}` : ""}`}
        />
        <div className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
          <span className="text-muted">Invoiced</span>
          <span className="text-right tabular-nums">{money(f.invoiced_amount, c)}</span>
          <span className="text-muted">Paid</span>
          <span className="text-right tabular-nums">{money(f.paid_amount, c)}</span>
        </div>
      </div>
    </Card>
  );
}
