import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csv(rows: (string | number | boolean | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          // Quote, escape quotes, and neutralize spreadsheet formulas.
          const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

// CSV exports. RLS decides which rows the caller gets.
export async function GET(request: NextRequest, ctx: RouteContext<"/[org]/reports/export">) {
  const { org: slug } = await ctx.params;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, slug").eq("slug", slug).maybeSingle();
  if (!org) return new NextResponse("Not found", { status: 404 });
  const { data: allowed } = await supabase.rpc("has_org_perm", { _org: org.id, _perm: "report.view" });
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const type = request.nextUrl.searchParams.get("type");
  const from = request.nextUrl.searchParams.get("from") ?? "1970-01-01";
  let body = "";
  if (type === "time") {
    const { data } = await supabase
      .from("time_entries")
      .select("work_date, minutes, billable, status, note, person:profiles!time_entries_user_id_fkey(full_name, email), project:projects!time_entries_project_id_fkey(key, name), task:tasks!time_entries_task_id_fkey(number, title)")
      .eq("org_id", org.id)
      .gte("work_date", from)
      .order("work_date");
    const rows = (data ?? []) as unknown as {
      work_date: string;
      minutes: number;
      billable: boolean;
      status: string;
      note: string | null;
      person: { full_name: string | null; email: string } | null;
      project: { key: string; name: string } | null;
      task: { number: number; title: string } | null;
    }[];
    body = csv([
      ["Date", "Person", "Email", "Project", "Task", "Hours", "Billable", "Status", "Note"],
      ...rows.map((r) => [
        r.work_date,
        r.person?.full_name,
        r.person?.email,
        r.project?.name,
        r.task ? `${r.project?.key}-${r.task.number} ${r.task.title}` : "",
        (r.minutes / 60).toFixed(2),
        r.billable ? "yes" : "no",
        r.status,
        r.note,
      ]),
    ]);
  } else if (type === "tasks") {
    const { data } = await supabase
      .from("tasks")
      .select("number, title, priority, start_date, due_date, estimate_hours, completed_at, created_at, project:projects!tasks_project_id_fkey(key, name), status:task_statuses(name)")
      .eq("org_id", org.id)
      .order("created_at");
    const rows = (data ?? []) as unknown as {
      number: number;
      title: string;
      priority: string;
      start_date: string | null;
      due_date: string | null;
      estimate_hours: number | null;
      completed_at: string | null;
      created_at: string;
      project: { key: string; name: string } | null;
      status: { name: string } | null;
    }[];
    body = csv([
      ["ID", "Title", "Project", "Status", "Priority", "Start", "Due", "Estimate (h)", "Created", "Completed"],
      ...rows.map((r) => [
        `${r.project?.key}-${r.number}`,
        r.title,
        r.project?.name,
        r.status?.name,
        r.priority,
        r.start_date,
        r.due_date,
        r.estimate_hours,
        r.created_at.slice(0, 10),
        r.completed_at?.slice(0, 10),
      ]),
    ]);
  } else {
    return new NextResponse("Unknown export", { status: 400 });
  }

  return new NextResponse("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
