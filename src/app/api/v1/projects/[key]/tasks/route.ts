import type { NextRequest } from "next/server";
import { badRequest, bearer, callApi, readJson } from "@/lib/api";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/projects/[key]/tasks">) {
  const { key } = await ctx.params;
  const sp = request.nextUrl.searchParams;
  return callApi("api_tasks", {
    _key: bearer(request),
    _project: key,
    _state: sp.get("state") ?? "all",
    _limit: Number(sp.get("limit") ?? 50),
    _offset: Number(sp.get("offset") ?? 0),
  });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/projects/[key]/tasks">) {
  const { key } = await ctx.params;
  const body = await readJson(request);
  if (!body) return badRequest("Send a JSON object");
  return callApi("api_create_task", { _key: bearer(request), _project: key, _fields: body });
}
