"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { bool, optional, refreshOrg, str } from "./shared";

// --- Invoicing settings and rates ----------------------------------------------

export async function saveInvoicingSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like USD"),
      invoice_prefix: z.string().regex(/^[A-Z0-9-]{1,10}$/, "Prefix: up to 10 capital letters, digits or dashes"),
      tax_rate: z.coerce.number().min(0).max(100),
      payment_terms_days: z.coerce.number().int().min(0).max(365),
      billing_address: z.string().max(1000).nullable(),
    })
    .safeParse({
      currency: str(form, "currency").toUpperCase(),
      invoice_prefix: str(form, "invoice_prefix").toUpperCase(),
      tax_rate: str(form, "tax_rate") || 0,
      payment_terms_days: str(form, "payment_terms_days") || 14,
      billing_address: optional(form, "billing_address"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(parsed.data).eq("id", str(form, "org_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}

export async function saveMemberRate(form: FormData) {
  const supabase = await createClient();
  const rate = str(form, "hourly_rate");
  const orgId = str(form, "org_id");
  const userId = str(form, "user_id");
  if (rate === "") {
    await supabase.from("member_rates").delete().eq("org_id", orgId).eq("user_id", userId);
  } else {
    await supabase.from("member_rates").upsert(
      { org_id: orgId, user_id: userId, hourly_rate: Number(rate), cost_rate: optional(form, "cost_rate") ? Number(str(form, "cost_rate")) : null },
      { onConflict: "org_id,user_id" },
    );
  }
  refreshOrg(str(form, "org_slug"));
}

// --- Security --------------------------------------------------------------------

export async function saveSecurity(_: ActionState, form: FormData): Promise<ActionState> {
  const domain = str(form, "sso_domain").toLowerCase();
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter a domain like company.com" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ require_mfa: bool(form, "require_mfa"), sso_domain: domain || null })
    .eq("id", str(form, "org_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}

// --- Integrations ------------------------------------------------------------------

export async function createApiKey(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(1).max(80).safeParse(str(form, "name"));
  if (!name.success) return { error: "Name the key" };
  const scopes = form.getAll("scopes").map(String).filter((s) => s === "read" || s === "write");
  if (!scopes.length) return { error: "Pick at least one scope" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_api_key", { _org: str(form, "org_id"), _name: name.data, _scopes: scopes });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  // Shown once; only a hash is stored.
  return { ok: `New key (copy it now, it will not be shown again): ${data}` };
}

export async function revokeApiKey(form: FormData) {
  const supabase = await createClient();
  await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function createWebhook(_: ActionState, form: FormData): Promise<ActionState> {
  const url = str(form, "url");
  if (!/^https:\/\/[^\s/]+/.test(url)) return { error: "Use an https:// address" };
  const events = form.getAll("events").map(String).filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").insert({
    org_id: str(form, "org_id"),
    name: str(form, "name") || (str(form, "kind") === "slack" ? "Slack" : "Webhook"),
    kind: str(form, "kind") === "slack" ? "slack" : "generic",
    url,
    events: events.length ? events : ["*"],
    project_id: optional(form, "project_id"),
  });
  if (error) return { error: error.message.includes("url") ? "That address is not allowed" : errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Webhook added" };
}

export async function toggleWebhook(form: FormData) {
  const supabase = await createClient();
  await supabase.from("webhooks").update({ enabled: bool(form, "enabled") }).eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteWebhook(form: FormData) {
  const supabase = await createClient();
  await supabase.from("webhooks").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function connectGithub(form: FormData) {
  const supabase = await createClient();
  await supabase.from("integrations").insert({ org_id: str(form, "org_id"), kind: "github" });
  refreshOrg(str(form, "org_slug"));
}

export async function disconnectGithub(form: FormData) {
  const supabase = await createClient();
  await supabase.from("integrations").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

// --- Automation --------------------------------------------------------------------

const TRIGGERS = ["task.created", "task.status_changed", "task.completed", "bug.created", "bug.status_changed"] as const;

export async function saveAutomationRule(_: ActionState, form: FormData): Promise<ActionState> {
  const name = z.string().trim().min(1, "Name the rule").max(120).safeParse(str(form, "name"));
  if (!name.success) return { error: name.error.issues[0]!.message };
  const trigger = z.enum(TRIGGERS).safeParse(str(form, "trigger"));
  if (!trigger.success) return { error: "Pick a trigger" };
  let conditions: unknown;
  let actions: unknown;
  try {
    conditions = JSON.parse(str(form, "conditions") || "{}");
    actions = JSON.parse(str(form, "actions") || "[]");
  } catch {
    return { error: "Could not read the rule" };
  }
  if (!Array.isArray(actions) || actions.length === 0) return { error: "Add at least one action" };
  const supabase = await createClient();
  const row = {
    org_id: str(form, "org_id"),
    project_id: optional(form, "project_id"),
    name: name.data,
    trigger: trigger.data,
    conditions,
    actions,
  };
  const id = str(form, "rule_id");
  const { error } = id ? await supabase.from("automation_rules").update(row).eq("id", id) : await supabase.from("automation_rules").insert(row);
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: id ? "Rule saved" : "Rule created" };
}

export async function toggleAutomationRule(form: FormData) {
  const supabase = await createClient();
  await supabase.from("automation_rules").update({ enabled: bool(form, "enabled") }).eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function deleteAutomationRule(form: FormData) {
  const supabase = await createClient();
  await supabase.from("automation_rules").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

// --- Platform: plan per organization ---------------------------------------------

export async function adminSetOrgPlan(form: FormData) {
  const supabase = await createClient();
  await supabase.rpc("admin_set_org_plan", { _org: str(form, "org_id"), _plan: str(form, "plan") });
  revalidatePath("/admin", "layout");
}
