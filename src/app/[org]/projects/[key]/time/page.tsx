import Link from "next/link";
import { getProjectContext, displayName } from "@/lib/session";
import { getProjectWork, getTimeEntries } from "@/lib/queries";
import { approveTime, rejectTime } from "@/lib/actions/time";
import { formatMinutes, TIME_STATUS } from "@/components/time-log";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { formatDate, isoInDays } from "@/lib/utils";

export default async function ProjectTimePage({ params, searchParams }: PageProps<"/[org]/projects/[key]/time">) {
  const { org: slug, key } = await params;
  const sp = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const from = typeof sp.from === "string" ? sp.from : isoInDays(-30);
  const to = typeof sp.to === "string" ? sp.to : isoInDays(0);
  const [entries, { tasks }] = await Promise.all([getTimeEntries({ projectId: ctx.project.id, from, to }), getProjectWork(ctx.project.id)]);
  const base = `/${slug}/projects/${ctx.project.key}`;
  const canApprove = ctx.canProject("timesheet.approve");
  const seesAll = canApprove || ctx.canProject("time.view_all");

  const byPerson = new Map<string, { name: string; avatar: string | null; total: number; billable: number }>();
  for (const e of entries) {
    const p = byPerson.get(e.user_id) ?? { name: displayName(e.person), avatar: e.person?.avatar_url ?? null, total: 0, billable: 0 };
    p.total += e.minutes;
    if (e.billable) p.billable += e.minutes;
    byPerson.set(e.user_id, p);
  }
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const estimate = tasks.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0);
  const pending = entries.filter((e) => e.status === "submitted");
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">From</span>
          <Input type="date" name="from" defaultValue={from} className="h-9 w-auto" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">To</span>
          <Input type="date" name="to" defaultValue={to} className="h-9 w-auto" />
        </label>
        <button className="h-9 rounded-lg border border-line-strong bg-surface px-3 hover:bg-surface-2">Apply</button>
        <span className="ml-auto text-muted">{seesAll ? "Everyone's time" : "Your time on this project"}</span>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Logged", formatMinutes(total)],
          ["Billable", formatMinutes(entries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0))],
          ["Estimated (all tasks)", `${estimate}h`],
          ["Awaiting approval", String(pending.length)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      {canApprove && pending.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader title={`Waiting for approval (${pending.length})`} />
          <form className="flex flex-col">
            {h("org_slug", slug)}
            <ul className="divide-y divide-line">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <input type="checkbox" name="entry_id" value={e.id} defaultChecked className="accent-[var(--brand)]" />
                  <span className="w-28 truncate">{displayName(e.person)}</span>
                  <span className="w-16">{formatMinutes(e.minutes)}</span>
                  <span className="text-muted">{formatDate(e.work_date)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.task ? `#${e.task.number} ${e.task.title}` : e.bug ? `Bug ${e.bug.number}` : ""}</span>
                  <span className="truncate text-muted">{e.note}</span>
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
      )}

      {entries.length === 0 ? (
        <EmptyState title="No time logged in this range" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="self-start">
            <CardHeader title="By person" />
            <ul className="divide-y divide-line">
              {[...byPerson.entries()]
                .sort((a, b) => b[1].total - a[1].total)
                .map(([id, p]) => (
                  <li key={id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <Avatar name={p.name} src={p.avatar} size={24} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="font-medium">{formatMinutes(p.total)}</span>
                  </li>
                ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Entries" />
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                  <span className="w-20 text-muted">{formatDate(e.work_date)}</span>
                  <span className="w-28 truncate">{displayName(e.person)}</span>
                  <span className="w-16 font-medium">{formatMinutes(e.minutes)}</span>
                  {e.task ? (
                    <Link href={`${base}/tasks/${e.task.number}`} className="min-w-0 flex-1 truncate hover:text-brand">
                      {ctx.project.key}-{e.task.number} {e.task.title}
                    </Link>
                  ) : e.bug ? (
                    <Link href={`${base}/bugs/${e.bug.number}`} className="min-w-0 flex-1 truncate hover:text-brand">
                      {ctx.project.key}-B{e.bug.number} {e.bug.title}
                    </Link>
                  ) : (
                    <span className="flex-1 text-muted">General</span>
                  )}
                  {!e.billable && <Badge>Non-billable</Badge>}
                  <Badge tone={TIME_STATUS[e.status]!.tone}>{TIME_STATUS[e.status]!.label}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
