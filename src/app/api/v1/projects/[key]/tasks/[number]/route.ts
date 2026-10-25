import type { NextRequest } from "next/server";
import { badRequest, bearer, callApi, readJson } from "@/lib/api";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/projects/[key]/tasks/[number]">) {
  const { key, number } = await ctx.params;
  if (!/^\d+$/.test(number)) return badRequest("Task number must be a number");
  return callApi("api_task", { _key: bearer(request), _project: key, _number: Number(number) });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/v1/projects/[key]/tasks/[number]">) {
  const { key, number } = await ctx.params;
  if (!/^\d+$/.test(number)) return badRequest("Task number must be a number");
  const body = await readJson(request);
  if (!body) return badRequest("Send a JSON object");
  return callApi("api_update_task", { _key: bearer(request), _project: key, _number: Number(number), _fields: body });
}
