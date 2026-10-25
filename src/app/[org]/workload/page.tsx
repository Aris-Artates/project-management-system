import Link from "next/link";
import type { Metadata } from "next";
import { getOrgContext, getSupabase, displayName, requireFeature } from "@/lib/session";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatMinutes } from "@/components/time-log";
import { cn, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Workload" };

type Assignment = {
  user_id: string;
  task: { id: string; due_date: string | null; estimate_hours: number | null; completed_at: string | null; project: { key: string } };
};

const WEEKS = 4;

function mondayISO(offsetWeeks: number) {
  const d = new Date(todayISO() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

// Open work per person: estimated hours by due week, plus time logged this week.
export default async function WorkloadPage({ params, searchParams }: PageProps<"/[org]/workload">) {
  const { org: slug } = await params;
  const { capacity } = await searchParams;
  const ctx = await getOrgContext(slug);
  requireFeature(ctx, "time");
  const supabase = await getSupabase();
  const weekly = Math.min(80, Math.max(1, Number(capacity) || 40));
  const starts = Array.from({ length: WEEKS + 1 }, (_, i) => mondayISO(i));

  const [{ data: members }, { data: assigned }, { data: logged }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, role:roles(system_key, name), profile:profiles!org_members_user_id_fkey(id, full_name, email, avatar_url)")
      .eq("org_id", ctx.org.id)
      .eq("status", "active"),
    supabase
      .from("task_assignees")
      .select("user_id, task:tasks!inner(id, due_date, estimate_hours, completed_at, project:projects!inner(key))")
      .eq("org_id", ctx.org.id)
      .is("task.completed_at", null),
    supabase.from("time_entries").select("user_id, minutes").eq("org_id", ctx.org.id).gte("work_date", starts[0]!),
  ]);

  const team = ((members ?? []) as unknown as {
    user_id: string;
    role: { system_key: string | null; name: string };
    profile: { id: string; full_name: string | null; email: string; avatar_url: string | null };
  }[]).filter((m) => m.role.system_key !== "client");

  const rows = team.map((m) => {
    const mine = ((assigned ?? []) as unknown as Assignment[]).filter((a) => a.user_id === m.user_id);
    const buckets = Array.from({ length: WEEKS }, () => ({ tasks: 0, hours: 0 }));
    let overdue = 0;
    let undated = 0;
    for (const a of mine) {
      const due = a.task.due_date;
      if (!due) {
        undated++;
        continue;
      }
      if (due < starts[0]!) {
        overdue++;
        buckets[0]!.tasks++;
        buckets[0]!.hours += Number(a.task.estimate_hours ?? 0);
        continue;
      }
      const i = starts.findIndex((s, idx) => idx < WEEKS && due >= s && due < starts[idx + 1]!);
      if (i >= 0) {
        buckets[i]!.tasks++;
        buckets[i]!.hours += Number(a.task.estimate_hours ?? 0);
      }
    }
    const loggedMin = (logged ?? []).filter((l) => l.user_id === m.user_id).reduce((s, l) => s + l.minutes, 0);
    return { m, buckets, overdue, undated, open: mine.length, loggedMin };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Workload"
        description="Open assigned tasks by due week, with estimated hours against weekly capacity."
        actions={
          <form className="flex items-center gap-2 text-sm">
            <label htmlFor="capacity" className="text-muted">
              Capacity
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              max={80}
              defaultValue={weekly}
              className="h-9 w-16 rounded-lg border border-line-strong bg-surface px-2"
            />
            <span className="text-muted">h/week</span>
          </form>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Person</th>
                {starts.slice(0, WEEKS).map((s, i) => (
                  <th key={s} className="px-3 py-2 text-left font-medium">
                    {i === 0 ? "This week" : `Week of ${new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">No date</th>
                <th className="px-4 py-2 text-right font-medium">Logged this week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ m, buckets, overdue, undated, loggedMin }) => (
                <tr key={m.user_id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={displayName(m.profile)} src={m.profile.avatar_url} size={28} />
                      <span>
                        <span className="block font-medium">{displayName(m.profile)}</span>
                        <span className="block text-xs text-muted">{m.role.name}</span>
                      </span>
                    </span>
                  </td>
                  {buckets.map((b, i) => {
                    const pct = Math.min(100, (b.hours / weekly) * 100);
                    const over = b.hours > weekly;
                    return (
                      <td key={i} className="px-3 py-3 align-top">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                          <div className={cn("h-full rounded-full", over ? "bg-danger" : pct > 75 ? "bg-warning" : "bg-brand")} style={{ width: `${pct}%` }} />
                        </div>
                        <p className={cn("mt-1 text-xs", over ? "font-medium text-danger" : "text-muted")}>
                          {b.tasks} task{b.tasks === 1 ? "" : "s"}, {b.hours}h
                          {i === 0 && overdue > 0 && <span className="text-danger"> ({overdue} overdue)</span>}
                        </p>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-xs text-muted">{undated || ""}</td>
                  <td className="px-4 py-3 text-right font-medium">{loggedMin ? formatMinutes(loggedMin) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted">
        Hours come from task estimates. Tasks without an estimate count toward the task total only.{" "}
        <Link href={`/${slug}/timesheet`} className="text-brand">
          Open your timesheet
        </Link>
      </p>
    </div>
  );
}
