import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingConfigured, PLAN_PRICES, stripe } from "@/lib/billing";
import { appUrl } from "@/lib/email";

// Starts a Stripe Checkout session for a plan upgrade.
export async function POST(request: NextRequest) {
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not set up" }, { status: 503 });
  const form = await request.formData();
  const slug = String(form.get("org") ?? "");
  const plan = String(form.get("plan") ?? "");
  const price = PLAN_PRICES[plan];
  if (!price) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(appUrl("/login"), 303);
  const { data: org } = await supabase.from("organizations").select("id, slug, stripe_customer_id").eq("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: allowed } = await supabase.rpc("has_org_perm", { _org: org.id, _perm: "billing.manage" });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: appUrl(`/${slug}/settings/plan?checkout=success`),
    cancel_url: appUrl(`/${slug}/settings/plan?checkout=cancelled`),
    client_reference_id: org.id,
    "metadata[org_id]": org.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][org_id]": org.id,
  };
  if (org.stripe_customer_id) params.customer = org.stripe_customer_id;
  else if (auth.user.email) params.customer_email = auth.user.email;

  try {
    const session = await stripe<{ url: string }>("checkout/sessions", params);
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 502 });
  }
}
