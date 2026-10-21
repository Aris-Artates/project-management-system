"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, type ActionState } from "@/lib/action-state";
import { slugify } from "@/lib/utils";

const RESERVED = new Set(["admin", "portal", "orgs", "login", "signup", "auth", "invite", "api", "suspended"]);

const schema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .transform(slugify)
    .refine((s) => s.length >= 1, "Choose a URL")
    .refine((s) => !RESERVED.has(s), "That URL is reserved"),
});

export async function createOrganization(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ name: form.get("name"), slug: form.get("slug") || form.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { _name: parsed.data.name, _slug: parsed.data.slug });
  if (error) {
    return { error: error.code === "23505" ? "That URL is already taken" : errorMessage(error) };
  }
  redirect(`/${parsed.data.slug}`);
}
