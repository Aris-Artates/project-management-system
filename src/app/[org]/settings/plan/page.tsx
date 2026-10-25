import { redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";
import type { Plan } from "@/lib/types";
import { billingConfigured } from "@/lib/billing";
import { formatBytes } from "@/lib/utils";

function Meter({ label, used, limit, format = String }: { label: string; used: number; limit: number | null; format?: (n: number) => string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const tone = !limit ? "bg-[var(--series-1)]" : pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-[var(--series-1)]";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {format(used)} {limit ? `of ${format(limit)}` : "(unlimited)"}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${limit ? pct : 4}%` }} />
      </div>
    </div>
  );
}

export default async function PlanPage({ params, searchParams }: PageProps<"/[org]/settings/plan">) {
  const { org: slug } = await params;
  const { checkout } = await searchParams;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("billing.manage")) redirect(`/${slug}/settings`);
  const supabase = await getSupabase();
  const [{ data: plans }, { count: members }, { count: projects }, { data: files }] = await Promise.all([
    supabase.from("plans").select("*").order("position"),
    supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "active"),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).neq("status", "archived"),
    supabase.from("attachments").select("size_bytes").eq("org_id", ctx.org.id),
  ]);
  const list = (plans ?? []) as Plan[];
  const current = list.find((p) => p.key === ctx.org.plan) ?? list[0]!;
  const storage = (files ?? []).reduce((s, f) => s + Number(f.size_bytes), 0);
  const stripe = billingConfigured();

  return (
    <div className="flex flex-col gap-6">
      {checkout === "success" && <Notice tone="success">Thanks! Your plan will update as soon as the payment is confirmed.</Notice>}
      {checkout === "cancelled" && <Notice tone="neutral">Checkout was cancelled. Nothing changed.</Notice>}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {current.name} plan {ctx.org.subscription_status && <Badge>{ctx.org.subscription_status}</Badge>}
            </span>
          }
          description={ctx.org.current_period_end ? `Renews ${new Date(ctx.org.current_period_end).toLocaleDateString()}` : undefined}
        />
        <div className="grid gap-5 p-4 md:grid-cols-3">
          <Meter label="Active members" used={members ?? 0} limit={current.max_members} />
          <Meter label="Active projects" used={projects ?? 0} limit={current.max_projects} />
          <Meter label="File storage" used={storage} limit={current.max_storage_mb ? current.max_storage_mb * 1024 * 1024 : null} format={formatBytes} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {list.map((p) => (
          <Card key={p.key} className={p.key === current.key ? "border-brand" : ""}>
            <div className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                {p.key === current.key && <Badge tone="brand">Current</Badge>}
              </div>
              <p className="text-2xl font-semibold">
                {p.price_monthly ? `$${p.price_monthly}` : "Free"}
                {p.price_monthly ? <span className="text-sm font-normal text-muted"> / month</span> : null}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-muted">
                <li>{p.max_members ? `Up to ${p.max_members} members` : "Unlimited members"}</li>
                <li>{p.max_projects ? `Up to ${p.max_projects} active projects` : "Unlimited projects"}</li>
                <li>{p.max_storage_mb ? `${formatBytes(p.max_storage_mb * 1024 * 1024)} of files` : "Unlimited files"}</li>
              </ul>
              <div className="mt-auto">
                {p.key !== current.key && p.price_monthly > 0 && stripe ? (
                  <form action={`/api/billing/checkout`} method="post">
                    <input type="hidden" name="org" value={slug} />
                    <input type="hidden" name="plan" value={p.key} />
                    <button className="h-9 w-full rounded-lg bg-brand text-sm font-medium text-on-brand hover:bg-brand-hover">Switch to {p.name}</button>
                  </form>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!stripe && (
        <Notice tone="neutral">
          Online payment is not set up yet, so plans are changed by the platform team. To take card payments, add the Stripe settings
          (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_TEAM, STRIPE_PRICE_BUSINESS) to the server.
        </Notice>
      )}
      {stripe && ctx.org.subscription_status && (
        <form action="/api/billing/portal" method="post">
          <input type="hidden" name="org" value={slug} />
          <button className="text-sm text-brand">Manage payment method and invoices</button>
        </form>
      )}
    </div>
  );
}
