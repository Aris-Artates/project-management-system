import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe over plain HTTPS (no SDK). Billing switches on only when these are set.
export function billingConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const PLAN_PRICES: Record<string, string | undefined> = {
  team: process.env.STRIPE_PRICE_TEAM,
  business: process.env.STRIPE_PRICE_BUSINESS,
};

export function planForPrice(priceId: string | undefined) {
  return Object.entries(PLAN_PRICES).find(([, p]) => p && p === priceId)?.[0] ?? null;
}

export async function stripe<T = Record<string, unknown>>(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

// Verifies the Stripe-Signature header (v1 scheme) with a 5 minute tolerance.
export function verifyStripeSignature(rawBody: string, header: string | null) {
  if (!header || !process.env.STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest("hex");
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
