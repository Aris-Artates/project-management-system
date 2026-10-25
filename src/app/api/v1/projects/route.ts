import type { NextRequest } from "next/server";
import { bearer, callApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return callApi("api_projects", { _key: bearer(request) });
}
