import { redirect } from "next/navigation";
import { getOrgContext, getSupabase, displayName, requireFeature } from "@/lib/session";
import { saveInvoicingSettings, saveMemberRate } from "@/lib/actions/admin-org";
import { ActionForm, SubmitButton } from "@/components/form";
import { Avatar, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";

export default async function InvoicingSettings({ params }: PageProps<"/[org]/settings/invoicing">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  requireFeature(ctx, "invoices");
  if (!ctx.can("invoice.manage")) redirect(`/${slug}/settings`);
  const supabase = await getSupabase();
  const [{ data: members }, { data: rates }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role:roles(name, system_key), profile:profiles!org_members_user_id_fkey(id, full_name, email, avatar_url)")
      .eq("org_id", ctx.org.id)
      .eq("status", "active"),
    supabase.from("member_rates").select("user_id, hourly_rate, cost_rate").eq("org_id", ctx.org.id),
  ]);
  const rateOf = new Map((rates ?? []).map((r) => [r.user_id, r]));
  const team = ((members ?? []) as unknown as {
    user_id: string;
    role: { name: string; system_key: string | null };
    profile: { id: string; full_name: string | null; email: string; avatar_url: string | null };
  }[]).filter((m) => m.role.system_key !== "client");
  const o = ctx.org;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="self-start">
        <CardHeader title="Invoice defaults" />
        <ActionForm action={saveInvoicingSettings} className="grid gap-4 p-4 sm:grid-cols-2">
          <input type="hidden" name="org_id" value={o.id} />
          <input type="hidden" name="org_slug" value={slug} />
          <Field label="Currency" hint="3-letter code">
            <Input name="currency" defaultValue={o.currency} maxLength={3} className="uppercase" required />
          </Field>
          <Field label="Number prefix" hint={`Next: ${o.invoice_prefix}-0001 style`}>
            <Input name="invoice_prefix" defaultValue={o.invoice_prefix} maxLength={10} className="uppercase" required />
          </Field>
          <Field label="Tax rate (%)">
            <Input name="tax_rate" type="number" min={0} max={100} step={0.01} defaultValue={o.tax_rate} />
          </Field>
          <Field label="Payment terms (days)">
            <Input name="payment_terms_days" type="number" min={0} max={365} defaultValue={o.payment_terms_days} />
          </Field>
          <Field label="Your billing address" hint="Printed on invoices" className="sm:col-span-2">
            <Textarea name="billing_address" defaultValue={o.billing_address ?? ""} rows={3} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Save</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Hourly rates" description="Used for invoices and cost reports. Leave blank to use the project rate." />
        <ul className="divide-y divide-line">
          {team.map((m) => {
            const r = rateOf.get(m.user_id);
            return (
              <li key={m.user_id} className="px-4 py-2.5">
                <form action={saveMemberRate} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="org_id" value={o.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <Avatar name={displayName(m.profile)} src={m.profile.avatar_url} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {displayName(m.profile)} <span className="text-muted">· {m.role.name}</span>
                  </span>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    Bill
                    <Input name="hourly_rate" type="number" min={0} step={0.01} defaultValue={r?.hourly_rate ?? ""} className="h-8 w-20" aria-label="Billing rate" />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    Cost
                    <Input name="cost_rate" type="number" min={0} step={0.01} defaultValue={r?.cost_rate ?? ""} className="h-8 w-20" aria-label="Cost rate" />
                  </label>
                  <Button size="sm" variant="secondary">
                    Save
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">Rates are in {o.currency} per hour.</p>
      </Card>
    </div>
  );
}
