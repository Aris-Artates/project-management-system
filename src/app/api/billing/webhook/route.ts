import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { billingConfigured, planForPrice, verifyStripeSignature } from "@/lib/billing";

type StripeEvent = {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      subscription?: string;
      status?: string;
      current_period_end?: number;
      metadata?: Record<string, string>;
      client_reference_id?: string;
      items?: { data: { price: { id: string } }[] };
    };
  };
};

// Stripe -> plan changes. Signature checked first; writes use the service role
// because plan and billing columns are not editable by organization members.
export async function POST(request: NextRequest) {
  if (!billingConfigured()) return NextResponse.json({ error: "Billing is not set up" }, { status: 503 });
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(raw) as StripeEvent;
  const obj = event.data.object;
  const db = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const orgId = obj.metadata?.org_id ?? obj.client_reference_id;
    if (orgId) {
      await db
        .from("organizations")
        .update({
          stripe_customer_id: obj.customer ?? null,
          stripe_subscription_id: obj.subscription ?? null,
          plan: obj.metadata?.plan ?? "team",
          subscription_status: "active",
        })
        .eq("id", orgId);
    }
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const deleted = event.type === "customer.subscription.deleted" || obj.status === "canceled";
    const plan = deleted ? "free" : planForPrice(obj.items?.data[0]?.price.id);
    await db
      .from("organizations")
      .update({
        subscription_status: deleted ? "canceled" : (obj.status ?? null),
        current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
        ...(plan ? { plan } : {}),
        ...(deleted ? { stripe_subscription_id: null } : {}),
      })
      .eq("stripe_subscription_id", obj.id);
  }
  return NextResponse.json({ received: true });
}
