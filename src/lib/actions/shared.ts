import "server-only";
import { revalidatePath } from "next/cache";

export function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optional(form: FormData, key: string) {
  return str(form, key) || null;
}

export function bool(form: FormData, key: string) {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

// Pages are rendered per request, so this mainly refreshes the client router.
export function refreshOrg(slug: string) {
  revalidatePath(`/${slug}`, "layout");
  revalidatePath(`/portal/${slug}`, "layout");
}
