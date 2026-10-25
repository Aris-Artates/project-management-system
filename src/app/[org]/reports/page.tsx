import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { BarList, ColumnChart, LineChart, SERIES, StatTile } from "@/components/charts";
import { Card, CardHeader, Dot, PageHeader, buttonClass } from "@/components/ui";
import { countByWeek, fmtHours, hours, sumByWeek, weekLabel, weekStarts } from "@/lib/reports";
import { isoInDays, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const WEEKS = 12;

export default async function ReportsPage({ params }: PageProps<"/[org]/reports">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("report.view")) redirect(`/${slug}`);
  const supabase = await getSupabase();
  const starts = weekStarts(WEEKS);
  const since = starts[0]!;
  const d30 = isoInDays(-30);
  const today = todayISO();

  const [{ data: projects }, { data: tasks }, { data: bugs }, { data: time }] = await Promise.all([
    supabase.from("projects").select("id, key, name, color, status").eq("org_id", ctx.org.id),
    supabase.from("tasks").select("project_id, created_at, completed_at, due_date").eq("org_id", ctx.org.id),
    supabase.from("bugs").select("project_id, created_at, closed_at, severity, status").eq("org_id", ctx.org.id),
    supabase
      .from("time_entries")
      .select("project_id, user_id, work_date, minutes, billable, person:profiles!time_entries_user_id_fkey(full_name, email)")
      .eq("org_id", ctx.org.id)
      .gte("work_date", since),
  ]);

  const P = projects ?? [];
  const T = tasks ?? [];
  const B = bugs ?? [];
  const E = (time ?? []) as unknown as { project_id: string; user_id: string; work_date: string; minutes: number; billable: boolean; person: { full_name: string | null; email: string } | null }[];
  const projectById = new Map(P.map((p) => [p.id, p]));

  const open = T.filter((t) => !t.completed_at);
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const done30 = T.filter((t) => t.completed_at && t.completed_at >= d30).length;
  const minutes30 = E.filter((e) => e.work_date >= d30).reduce((s, e) => s + e.minutes, 0);
  const openBugs = B.filter((b) => !["fixed", "verified", "closed"].includes(b.status));

  const labels = starts.map(weekLabel);
  const created = countByWeek(starts, T.map((t) => t.created_at));
  const completed = countByWeek(starts, T.map((t) => t.completed_at));
  const bugsOpened = countByWeek(starts, B.map((b) => b.created_at));
  const bugsClosed = countByWeek(starts, B.map((b) => b.closed_at));
  const hoursWeekly = sumByWeek(starts, E.map((e) => ({ date: e.work_date, value: e.minutes }))).map(hours);

  const byProject = new Map<string, number>();
  const byPerson = new Map<string, { name: string; min: number }>();
  for (const e of E.filter((x) => x.work_date >= d30)) {
    byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + e.minutes);
    const p = byPerson.get(e.user_id) ?? { name: displayName(e.person), min: 0 };
    p.min += e.minutes;
    byPerson.set(e.user_id, p);
  }
  const overdueByProject = new Map<string, number>();
  for (const t of overdue) overdueByProject.set(t.project_id, (overdueByProject.get(t.project_id) ?? 0) + 1);

  const projectLabel = (id: string) => {
    const p = projectById.get(id);
    return (
      <span className="flex items-center gap-1.5">
        <Dot color={p?.color ?? "#64748b"} className="size-2" />
        {p?.name ?? "Unknown"}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        description={`Across ${P.filter((p) => p.status !== "archived").length} projects in ${ctx.org.name}. Time figures include only entries you are allowed to see.`}
        actions={
          <>
            <a href={`/${slug}/reports/export?type=tasks`} className={buttonClass("secondary", "sm")}>
              Export tasks (CSV)
            </a>
            <a href={`/${slug}/reports/export?type=time&from=${since}`} className={buttonClass("secondary", "sm")}>
              Export time (CSV)
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Open tasks" value={String(open.length)} />
        <StatTile label="Overdue" value={String(overdue.length)} tone={overdue.length ? "danger" : undefined} />
        <StatTile label="Done, last 30 days" value={String(done30)} />
        <StatTile label="Hours, last 30 days" value={fmtHours(hours(minutes30))} />
        <StatTile label="Open bugs" value={String(openBugs.length)} />
        <StatTile
          label="Critical or blocker"
          value={String(openBugs.filter((b) => b.severity === "critical" || b.severity === "blocker").length)}
          tone={openBugs.some((b) => b.severity === "critical" || b.severity === "blocker") ? "danger" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tasks created and completed" description={`Per week, last ${WEEKS} weeks`} />
          <div className="p-4">
            <LineChart
              labels={labels}
              series={[
                { name: "Created", values: created },
                { name: "Completed", values: completed },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Bugs opened and closed" description={`Per week, last ${WEEKS} weeks`} />
          <div className="p-4">
            <LineChart
              labels={labels}
              series={[
                { name: "Opened", values: bugsOpened },
                { name: "Closed", values: bugsClosed },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Hours logged" description={`Per week, last ${WEEKS} weeks`} />
          <div className="p-4">
            <ColumnChart data={labels.map((l, i) => ({ label: l, value: hoursWeekly[i]! }))} unit="hours" name="Hours" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Overdue tasks by project" />
          <div className="p-4">
            <BarList
              rows={[...overdueByProject.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ key: id, label: projectLabel(id), value: n }))}
              color={SERIES[1]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Hours by project" description="Last 30 days" />
          <div className="p-4">
            <BarList
              rows={[...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([id, m]) => ({ key: id, label: projectLabel(id), value: hours(m) }))}
              unit="hours"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Hours by person" description="Last 30 days" />
          <div className="p-4">
            <BarList
              rows={[...byPerson.entries()].sort((a, b) => b[1].min - a[1].min).map(([id, p]) => ({ key: id, label: p.name, value: hours(p.min) }))}
              unit="hours"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
