import Link from "next/link";
import type { Metadata } from "next";
import { getOrgContext, displayName, requireFeature } from "@/lib/session";
import { getMyTimer, getTimeEntries } from "@/lib/queries";
import { approveTime, rejectTime, stopTimer, submitWeek } from "@/lib/actions/time";
import { ActionForm, SubmitButton } from "@/components/form";
import { ElapsedClock } from "@/components/elapsed-clock";
import { formatMinutes, TIME_STATUS } from "@/components/time-log";
import { Badge, Button, Card, CardHeader, Dot, EmptyState, PageHeader } from "@/components/ui";
import { cn, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Timesheet" };

function mondayOf(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export default async function TimesheetPage({ params, searchParams }: PageProps<"/[org]/timesheet">) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(slug);
  requireFeature(ctx, "time");
  const week = mondayOf(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayISO());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const from = iso(days[0]!);
  const to = iso(days[6]!);
  const view = sp.view === "approvals" ? "approvals" : "mine";

  const [mine, timer, pending] = await Promise.all([
    getTimeEntries({ orgId: ctx.org.id, userId: ctx.profile.id, from, to }),
    getMyTimer(ctx.profile.id),
    getTimeEntries({ orgId: ctx.org.id, status: "submitted" }),
  ]);
  // RLS only returns other people's entries to those allowed to see or approve them.
  const approvals = pending.filter((e) => e.user_id !== ctx.profile.id || ctx.isOrgAdmin);
  const showApprovals = ctx.can("timesheet.approve") || approvals.length > 0;

  // Rows: one per project + task/bug, columns: days.
  const rows = new Map<string, { label: string; href: string | null; color: string; perDay: number[] }>();
  for (const e of mine) {
    const keyStr = `${e.project_id}:${e.task_id ?? ""}:${e.bug_id ?? ""}`;
    const label = e.task
      ? `${e.project?.key}-${e.task.number} ${e.task.title}`
      : e.bug
        ? `${e.project?.key}-B${e.bug.number} ${e.bug.title}`
        : `${e.project?.name} (general)`;
    const href = e.task
      ? `/${slug}/projects/${e.project?.key}/tasks/${e.task.number}`
      : e.bug
        ? `/${slug}/projects/${e.project?.key}/bugs/${e.bug.number}`
        : null;
    const row = rows.get(keyStr) ?? { label, href, color: e.project?.color ?? "#64748b", perDay: Array(7).fill(0) };
    const idx = days.findIndex((d) => iso(d) === e.work_date);
    if (idx >= 0) row.perDay[idx] += e.minutes;
    rows.set(keyStr, row);
  }
  const dayTotals = days.map((_, i) => [...rows.values()].reduce((s, r) => s + r.perDay[i]!, 0));
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const statusCounts = mine.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
  const submittable = (statusCounts.draft ?? 0) + (statusCounts.rejected ?? 0);
  const base = `/${slug}/timesheet`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Timesheet"
        actions={
          showApprovals && (
            <div className="flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm">
              <Link href={base} className={cn("rounded-md px-3 py-1", view === "mine" ? "bg-brand text-on-brand" : "text-muted")}>
                My time
              </Link>
              <Link href={`${base}?view=approvals`} className={cn("rounded-md px-3 py-1", view === "approvals" ? "bg-brand text-on-brand" : "text-muted")}>
                Approvals {approvals.length ? `(${approvals.length})` : ""}
              </Link>
            </div>
          )
        }
      />

      {timer && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 border-ember/40 p-3 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-ember" />
          <span className="font-mono text-ember">
            <ElapsedClock since={timer.started_at} />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {timer.task ? `${timer.project.key}-${timer.task.number} ${timer.task.title}` : timer.bug ? `${timer.project.key}-B${timer.bug.number} ${timer.bug.title}` : timer.project.name}
          </span>
          <form action={stopTimer}>
            <input type="hidden" name="org_slug" value={slug} />
            <Button size="sm" variant="danger">
              Stop and log
            </Button>
          </form>
        </Card>
      )}

      {view === "approvals" ? (
        approvals.length === 0 ? (
          <EmptyState title="Nothing waiting for approval" />
        ) : (
          <Card>
            <CardHeader title="Submitted time" />
            <form>
              <input type="hidden" name="org_slug" value={slug} />
              <ul className="divide-y divide-line">
                {approvals.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" name="entry_id" value={e.id} defaultChecked className="accent-[var(--brand)]" />
                    <span className="w-32 truncate font-medium">{displayName(e.person)}</span>
                    <span className="w-16">{formatMinutes(e.minutes)}</span>
                    <span className="w-24 text-muted">{e.work_date}</span>
                    <Dot color={e.project?.color ?? "#64748b"} />
                    <span className="min-w-0 flex-1 truncate">
                      {e.project?.key} {e.task ? `#${e.task.number} ${e.task.title}` : e.bug ? `bug ${e.bug.number}` : ""}
                    </span>
                    <span className="max-w-60 truncate text-muted">{e.note}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 border-t border-line p-3">
                <Button formAction={approveTime} size="sm">
                  Approve selected
                </Button>
                <Button formAction={rejectTime} size="sm" variant="secondary">
                  Reject selected
                </Button>
              </div>
            </form>
          </Card>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Link href={`${base}?week=${iso(addDays(week, -7))}`} className="rounded-lg border border-line-strong bg-surface px-3 py-1 hover:bg-surface-2">
              Previous
            </Link>
            <Link href={base} className="rounded-lg border border-line-strong bg-surface px-3 py-1 hover:bg-surface-2">
              This week
            </Link>
            <Link href={`${base}?week=${iso(addDays(week, 7))}`} className="rounded-lg border border-line-strong bg-surface px-3 py-1 hover:bg-surface-2">
              Next
            </Link>
            <span className="font-medium">
              {days[0]!.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to{" "}
              {days[6]!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </span>
            <span className="ml-auto flex gap-1">
              {Object.entries(statusCounts).map(([s, n]) => (
                <Badge key={s} tone={TIME_STATUS[s]!.tone}>
                  {n} {TIME_STATUS[s]!.label.toLowerCase()}
                </Badge>
              ))}
            </span>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Work</th>
                  {days.map((d) => (
                    <th key={iso(d)} className={cn("w-16 px-2 py-2 text-right font-medium", iso(d) === todayISO() && "text-brand")}>
                      {d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} {d.getUTCDate()}
                    </th>
                  ))}
                  <th className="w-20 px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.size === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted">
                      No time this week. Log time from a task or bug, or start a timer there.
                    </td>
                  </tr>
                )}
                {[...rows.entries()].map(([k, r]) => (
                  <tr key={k}>
                    <td className="max-w-72 px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Dot color={r.color} />
                        {r.href ? (
                          <Link href={r.href} className="truncate hover:text-brand">
                            {r.label}
                          </Link>
                        ) : (
                          <span className="truncate">{r.label}</span>
                        )}
                      </span>
                    </td>
                    {r.perDay.map((m, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {m ? formatMinutes(m) : <span className="text-line-strong">-</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMinutes(r.perDay.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                ))}
              </tbody>
              {rows.size > 0 && (
                <tfoot className="border-t border-line-strong font-medium">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    {dayTotals.map((m, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {m ? formatMinutes(m) : ""}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums">{formatMinutes(weekTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>

          {submittable > 0 && (
            <ActionForm action={submitWeek} className="mt-4 flex items-center gap-3">
              <input type="hidden" name="org_slug" value={slug} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <SubmitButton pendingText="Submitting...">Submit week for approval</SubmitButton>
              <span className="text-sm text-muted">
                {submittable} entr{submittable === 1 ? "y" : "ies"} will be locked until reviewed.
              </span>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
