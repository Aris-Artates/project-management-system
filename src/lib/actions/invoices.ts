"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { sendEmail, appUrl } from "@/lib/email";
import { optional, refreshOrg, str } from "./shared";

export async function createInvoiceFromTime(_: ActionState, form: FormData): Promise<ActionState> {
  const from = str(form, "from");
  const to = str(form, "to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: "Pick a date range" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice_from_time", {
    _project: str(form, "project_id"),
    _from: from,
    _to: to,
    _group: str(form, "group") || "person",
  });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  redirect(`/${str(form, "org_slug")}/invoices/${data}`);
}

export async function createBlankInvoice(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const projectId = optional(form, "project_id");
  let billTo: { client_name: string | null; client_email: string | null } | null = null;
  if (projectId) {
    const { data } = await supabase.from("projects").select("client_name, client_email").eq("id", projectId).single();
    billTo = data;
  }
  const { data, error } = await supabase
    .from("invoices")
    .insert({ org_id: str(form, "org_id"), project_id: projectId, number: "pending", currency: null, bill_to_name: billTo?.client_name ?? null, bill_to_email: billTo?.client_email ?? null })
    .select("id")
    .single();
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  redirect(`/${str(form, "org_slug")}/invoices/${data.id}`);
}

export async function saveInvoiceDetails(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      bill_to_name: z.string().max(200).nullable(),
      bill_to_email: z.email().nullable().or(z.literal(null)),
      issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      tax_rate: z.coerce.number().min(0).max(100),
      notes: z.string().max(5000).nullable(),
    })
    .safeParse({
      bill_to_name: optional(form, "bill_to_name"),
      bill_to_email: optional(form, "bill_to_email"),
      issue_date: str(form, "issue_date"),
      due_date: optional(form, "due_date"),
      tax_rate: str(form, "tax_rate") || 0,
      notes: optional(form, "notes"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const id = str(form, "invoice_id");
  const { error } = await supabase.from("invoices").update(parsed.data).eq("id", id);
  if (error) return { error: errorMessage(error) };
  await supabase.rpc("recalc_invoice", { _invoice: id });
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}

export async function addInvoiceItem(_: ActionState, form: FormData): Promise<ActionState> {
  const description = str(form, "description");
  if (!description) return { error: "Describe the line" };
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").insert({
    invoice_id: str(form, "invoice_id"),
    description: description.slice(0, 500),
    quantity: Number(str(form, "quantity") || 1),
    unit_price: Number(str(form, "unit_price") || 0),
    position: 999,
  });
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return null;
}

export async function deleteInvoiceItem(form: FormData) {
  const supabase = await createClient();
  await supabase.from("invoice_items").delete().eq("id", str(form, "id"));
  refreshOrg(str(form, "org_slug"));
}

export async function setInvoiceStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const status = str(form, "status");
  if (!["sent", "paid", "void"].includes(status)) return { error: "Unknown status" };
  const supabase = await createClient();
  const id = str(form, "invoice_id");
  const { data: inv, error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .select("number, total, currency, bill_to_email, due_date, org:organizations(name, slug)")
    .single();
  if (error) return { error: errorMessage(error) };

  if (status === "sent" && inv.bill_to_email && form.get("email") === "on") {
    const org = inv.org as unknown as { name: string; slug: string };
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(Number(inv.total));
    await sendEmail(
      inv.bill_to_email,
      `Invoice ${inv.number} from ${org.name}`,
      `<p>Hello,</p><p>${org.name} sent you invoice <b>${inv.number}</b> for <b>${amount}</b>${inv.due_date ? `, due ${inv.due_date}` : ""}.</p><p><a href="${appUrl(`/portal/${org.slug}/invoices/${id}`)}">View the invoice</a></p>`,
    );
  }
  refreshOrg(str(form, "org_slug"));
  return { ok: `Marked ${status}` };
}

export async function deleteDraftInvoice(form: FormData) {
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", str(form, "invoice_id")).eq("status", "draft");
  refreshOrg(str(form, "org_slug"));
  redirect(`/${str(form, "org_slug")}/invoices`);
}

export async function saveProjectBilling(_: ActionState, form: FormData): Promise<ActionState> {
  const num = (k: string) => (str(form, k) === "" ? null : Number(str(form, k)));
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      billing_type: ["none", "hourly", "fixed"].includes(str(form, "billing_type")) ? str(form, "billing_type") : "hourly",
      hourly_rate: num("hourly_rate"),
      budget_amount: num("budget_amount"),
      budget_hours: num("budget_hours"),
      client_name: optional(form, "client_name"),
      client_email: optional(form, "client_email"),
    })
    .eq("id", str(form, "project_id"));
  if (error) return { error: errorMessage(error) };
  refreshOrg(str(form, "org_slug"));
  return { ok: "Saved" };
}
