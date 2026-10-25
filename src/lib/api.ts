import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Public API: every call goes to a SECURITY DEFINER function that checks the
// key's hash and scope, so only the anon key is needed here.
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const STATUS: Record<string, number> = {
  "28000": 401, // invalid key
  "42501": 403, // missing scope / suspended
  P0002: 404, // not found
  "22023": 400, // bad input
  "22P02": 400, // invalid text representation
  "22007": 400, // invalid date
  "22008": 400,
  "23514": 400, // check constraint
};

export function bearer(request: NextRequest) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function callApi(fn: string, args: Record<string, unknown>) {
  const { data, error } = await anon().rpc(fn, args);
  if (error) {
    const status = STATUS[error.code ?? ""] ?? 500;
    return NextResponse.json({ error: status === 500 ? "Something went wrong" : error.message }, { status });
  }
  return NextResponse.json({ data });
}

export async function readJson(request: NextRequest) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });
