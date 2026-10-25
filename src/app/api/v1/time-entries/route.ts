import type { NextRequest } from "next/server";
import { bearer, callApi } from "@/lib/api";

const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return callApi("api_time_entries", { _key: bearer(request), _from: date(sp.get("from")), _to: date(sp.get("to")) });
}
