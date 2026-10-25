import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingConfigured, stripe } from "@/lib/billing";
import { appUrl } from "@/lib/email";

// Opens Stripe's customer portal (payment method, invoices, cancel).
export async function POST(request: NextRequest) {
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not set up" }, { status: 503 });
  const form = await request.formData();
  const slug = String(form.get("org") ?? "");
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, stripe_customer_id").eq("slug", slug).maybeSingle();
  if (!org?.stripe_customer_id) return NextResponse.json({ error: "No subscription yet" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("has_org_perm", { _org: org.id, _perm: "billing.manage" });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const session = await stripe<{ url: string }>("billing_portal/sessions", {
      customer: org.stripe_customer_id,
      return_url: appUrl(`/${slug}/settings/plan`),
    });
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Portal failed" }, { status: 502 });
  }
}
