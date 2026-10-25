import { redirect } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getBugs, getProjectWork, getTimeEntries } from "@/lib/queries";
import { BarList, LineChart, SERIES, StackedBar, StatTile } from "@/components/charts";
import { Card, CardHeader } from "@/components/ui";
import { hours, weekIndex, weekLabel, weekStarts } from "@/lib/reports";
import { todayISO } from "@/lib/utils";
import { SEVERITY } from "@/lib/bug-meta";

const WEEKS = 10;

export default async function ProjectReports({ params }: PageProps<"/[org]/projects/[key]/reports">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  if (ctx.isClient) redirect(`/portal/${slug}/${key}`);
  const [{ tasks, statuses }, bugs, time] = await Promise.all([
    getProjectWork(ctx.project.id),
    getBugs(ctx.project.id),
    getTimeEntries({ projectId: ctx.project.id }),
  ]);
  const top = tasks.filter((t) => !t.parent_id);
  const starts = weekStarts(WEEKS);
  const today = todayISO();

  // Burnup: total scope vs completed, cumulative at the end of each week.
  // weekIndex is -1 for dates before the first week, so those count everywhere.
  const scope = starts.map((_, i) => top.filter((t) => weekIndex(starts, t.created_at) <= i).length);
  const done = starts.map((_, i) => top.filter((t) => t.completed_at && weekIndex(starts, t.completed_at) <= i).length);

  const byCategory = (["todo", "in_progress", "done"] as const).map((c, i) => ({
    label: c === "todo" ? "To do" : c === "in_progress" ? "In progress" : "Done",
    value: top.filter((t) => statuses.find((s) => s.id === t.status_id)?.category === c).length,
    color: SERIES[i]!,
  }));

  const minutes = time.reduce((s, e) => s + e.minutes, 0);
  const estimate = top.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0);
  const byPerson = new Map<string, { name: string; min: number }>();
  for (const e of time) {
    const p = byPerson.get(e.user_id) ?? { name: displayName(e.person), min: 0 };
    p.min += e.minutes;
    byPerson.set(e.user_id, p);
  }
  const openBugs = bugs.filter((b) => !["fixed", "verified", "closed"].includes(b.status));
  const overdue = top.filter((t) => !t.completed_at && t.due_date && t.due_date < today).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Progress" value={`${top.length ? Math.round((byCategory[2]!.value / top.length) * 100) : 0}%`} hint={`${byCategory[2]!.value} of ${top.length} tasks`} />
        <StatTile label="Overdue tasks" value={String(overdue)} tone={overdue ? "danger" : undefined} />
        <StatTile label="Hours logged" value={`${hours(minutes)}h`} hint={estimate ? `of ${estimate}h estimated` : "No estimates yet"} />
        <StatTile label="Open bugs" value={String(openBugs.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Burnup" description="Total tasks versus tasks done, end of each week" />
          <div className="p-4">
            <LineChart
              labels={starts.map(weekLabel)}
              series={[
                { name: "Total scope", values: scope },
                { name: "Done", values: done },
              ]}
            />
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Tasks by stage" />
            <div className="p-4">
              <StackedBar segments={byCategory} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Open bugs by severity" />
            <div className="p-4">
              <StackedBar
                segments={(["minor", "major", "critical", "blocker"] as const).map((s, i) => ({
                  label: SEVERITY[s].label,
                  value: openBugs.filter((b) => b.severity === s).length,
                  color: SERIES[i]!,
                }))}
              />
            </div>
          </Card>
        </div>
        <Card>
          <CardHeader title="Hours by person" description="All time on this project you can see" />
          <div className="p-4">
            <BarList rows={[...byPerson.entries()].sort((a, b) => b[1].min - a[1].min).map(([id, p]) => ({ key: id, label: p.name, value: hours(p.min) }))} unit="hours" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Estimate versus logged" description="Top tasks by hours logged" />
          <div className="p-4">
            <BarList
              rows={top
                .map((t) => ({ t, min: time.filter((e) => e.task_id === t.id).reduce((s, e) => s + e.minutes, 0) }))
                .filter((x) => x.min > 0)
                .sort((a, b) => b.min - a.min)
                .slice(0, 8)
                .map(({ t, min }) => ({
                  key: t.id,
                  label: `${ctx.project.key}-${t.number} ${t.title}${t.estimate_hours ? ` (est. ${t.estimate_hours}h)` : ""}`,
                  value: hours(min),
                }))}
              unit="hours"
              color={SERIES[2]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
