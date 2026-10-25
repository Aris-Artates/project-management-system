import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Full organization export. Runs with the caller's session, so RLS applies.
export async function GET(_req: NextRequest, ctx: RouteContext<"/[org]/settings/export/download">) {
  const { org: slug } = await ctx.params;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name, slug, plan, currency, created_at").eq("slug", slug).maybeSingle();
  if (!org) return new NextResponse("Not found", { status: 404 });
  const { data: allowed } = await supabase.rpc("has_org_perm", { _org: org.id, _perm: "org.settings" });
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const tables = [
    "projects",
    "task_statuses",
    "task_lists",
    "milestones",
    "tags",
    "tasks",
    "task_assignees",
    "task_dependencies",
    "comments",
    "bugs",
    "time_entries",
    "documents",
    "topics",
    "events",
    "event_attendees",
    "invoices",
    "custom_fields",
    "task_field_values",
    "roles",
    "org_members",
  ] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), organization: org };
  for (const t of tables) {
    const rows: unknown[] = [];
    // Page through large tables.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select("*").eq("org_id", org.id).range(from, from + 999);
      if (error || !data?.length) break;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    out[t] = rows;
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
