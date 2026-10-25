import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, CircleAlert, CircleX, CircleDot } from "lucide-react";
import { getOrgContext, getSupabase } from "@/lib/session";
import { StatTile } from "@/components/charts";
import { Card, Dot, EmptyState, PageHeader } from "@/components/ui";
import { PROJECT_STATUS } from "@/components/project-bits";
import { hours, projectHealth, type Health } from "@/lib/reports";
import { formatDate, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Portfolio" };

// Status colors never stand alone: each health state has an icon and a label.
const HEALTH: Record<Health, { label: string; icon: typeof CircleCheck; color: string }> = {
  on_track: { label: "On track", icon: CircleCheck, color: "var(--status-good)" },
  at_risk: { label: "At risk", icon: CircleAlert, color: "var(--warning)" },
  off_track: { label: "Off track", icon: CircleX, color: "var(--status-critical)" },
  done: { label: "Completed", icon: CircleDot, color: "var(--muted)" },
};

export default async function PortfolioPage({ params }: PageProps<"/[org]/portfolio">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("report.view") && !ctx.can("project.view_all")) redirect(`/${slug}`);
  const supabase = await getSupabase();
  const today = todayISO();

  const [{ data: projects }, { data: tasks }, { data: bugs }, { data: time }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, key, name, color, status, start_date, end_date, owner:profiles!projects_owner_id_fkey(full_name, email)")
      .eq("org_id", ctx.org.id)
      .neq("status", "archived")
      .order("name"),
    supabase.from("tasks").select("project_id, completed_at, due_date, estimate_hours, parent_id").eq("org_id", ctx.org.id),
    supabase.from("bugs").select("project_id, severity, status").eq("org_id", ctx.org.id),
    supabase.from("time_entries").select("project_id, minutes").eq("org_id", ctx.org.id),
  ]);

  const rows = ((projects ?? []) as unknown as {
    id: string;
    key: string;
    name: string;
    color: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    owner: { full_name: string | null; email: string } | null;
  }[]).map((p) => {
    const pt = (tasks ?? []).filter((t) => t.project_id === p.id && !t.parent_id);
    const doneCount = pt.filter((t) => t.completed_at).length;
    const overdue = pt.filter((t) => !t.completed_at && t.due_date && t.due_date < today).length;
    const pb = (bugs ?? []).filter((b) => b.project_id === p.id && !["fixed", "verified", "closed"].includes(b.status));
    const blockers = pb.filter((b) => b.severity === "critical" || b.severity === "blocker").length;
    const logged = (time ?? []).filter((e) => e.project_id === p.id).reduce((s, e) => s + e.minutes, 0);
    const estimate = pt.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0);
    const { health, reason } = projectHealth({
      status: p.status,
      start: p.start_date,
      end: p.end_date,
      total: pt.length,
      done: doneCount,
      overdue,
      blockers,
      today,
    });
    return { p, total: pt.length, doneCount, overdue, openBugs: pb.length, blockers, logged, estimate, health, reason };
  });

  const order: Health[] = ["off_track", "at_risk", "on_track", "done"];
  rows.sort((a, b) => order.indexOf(a.health) - order.indexOf(b.health));
  const count = (h: Health) => rows.filter((r) => r.health === h).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Portfolio" description="Health of every active project, worst first." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Projects" value={String(rows.length)} />
        <StatTile label="On track" value={String(count("on_track"))} />
        <StatTile label="At risk" value={String(count("at_risk"))} />
        <StatTile label="Off track" value={String(count("off_track"))} tone={count("off_track") ? "danger" : undefined} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No active projects" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Health</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Overdue</th>
                <th className="px-3 py-2 font-medium">Open bugs</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const H = HEALTH[r.health];
                const pct = r.total ? Math.round((r.doneCount / r.total) * 100) : 0;
                return (
                  <tr key={r.p.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/${slug}/projects/${r.p.key}`} className="flex items-center gap-2 font-medium hover:text-brand">
                        <Dot color={r.p.color} />
                        {r.p.name}
                      </Link>
                      <span className="ml-[18px] text-xs text-muted">{PROJECT_STATUS[r.p.status]?.label}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 font-medium">
                        <H.icon size={16} style={{ color: H.color }} aria-hidden="true" />
                        {H.label}
                      </span>
                      <span className="block text-xs text-muted">{r.reason}</span>
                    </td>
                    <td className="w-40 px-3 py-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted">
                        {pct}% · {r.doneCount}/{r.total}
                      </span>
                    </td>
                    <td className={`px-3 py-3 tabular-nums ${r.overdue ? "font-medium text-danger" : ""}`}>{r.overdue}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.openBugs}
                      {r.blockers > 0 && <span className="block text-xs text-danger">{r.blockers} critical</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {hours(r.logged)}h{r.estimate ? <span className="block text-xs text-muted">of {r.estimate}h est.</span> : null}
                    </td>
                    <td className="px-3 py-3">{r.p.end_date ? formatDate(r.p.end_date, { month: "short", day: "numeric", year: "numeric" }) : <span className="text-muted">None</span>}</td>
                    <td className="px-4 py-3 text-muted">{r.p.owner?.full_name ?? r.p.owner?.email ?? "None"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
