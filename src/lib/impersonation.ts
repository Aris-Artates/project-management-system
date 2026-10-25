import "server-only";
import { cookies } from "next/headers";

export const IMPERSONATOR_COOKIE = "pl_impersonator";

// Display only: who started the session and as whom. Access is decided by the
// actual Supabase session, never by this cookie.
export async function getImpersonation() {
  const raw = (await cookies()).get(IMPERSONATOR_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { email?: string; as?: string };
    return v.as ? { by: v.email ?? "a Dev", as: v.as } : null;
  } catch {
    return null;
  }
}
