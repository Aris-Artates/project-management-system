import Link from "next/link";
import { getProjectContext, getSupabase, displayName } from "@/lib/session";
import { BudgetCard, type Financials } from "@/components/budget-card";
import { getActivity, getProjectMembers, getProjectWork } from "@/lib/queries";
import { Avatar, Badge, Card, CardHeader, Dot, EmptyState } from "@/components/ui";
import { DueLabel, StatusPill, TaskRef } from "@/components/project-bits";
import { formatDate, isOverdue, isoInDays, timeAgo, todayISO } from "@/lib/utils";

export default async function ProjectOverview({ params }: PageProps<"/[org]/projects/[key]">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const base = `/${slug}/projects/${ctx.project.key}`;
  const [{ tasks, statuses, milestones }, members, activity] = await Promise.all([
    getProjectWork(ctx.project.id),
    getProjectMembers(ctx.project.id, ctx.org.id),
    getActivity(ctx.project.id, 15),
  ]);

  let financials: Financials | null = null;
  if (ctx.canProject("budget.view")) {
    const { data } = await (await getSupabase()).rpc("project_financials", { _project: ctx.project.id });
    financials = ((data as Financials[] | null) ?? [])[0] ?? null;
  }
  const done = tasks.filter((t) => t.completed_at).length;
  const overdue = tasks.filter((t) => isOverdue(t.due_date, !!t.completed_at));
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const byStatus = statuses.map((s) => ({ status: s, count: tasks.filter((t) => t.status_id === s.id).length }));
  const week = isoInDays(7);
  const upcoming = tasks
    .filter((t) => !t.completed_at && t.due_date && t.due_date >= todayISO() && t.due_date <= week)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  const stats = [
    { label: "Progress", value: `${pct}%` },
    { label: "Open tasks", value: tasks.length - done },
    { label: "Overdue", value: overdue.length, danger: overdue.length > 0 },
    { label: "Due", value: ctx.project.end_date ? formatDate(ctx.project.end_date) : "Not set" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {ctx.project.description && <p className="text-sm text-muted">{ctx.project.description}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${s.danger ? "text-danger" : ""}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader title="Tasks by status" />
          <div className="p-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {byStatus.map(({ status, count }) =>
                count ? (
                  <div key={status.id} style={{ width: `${(count / tasks.length) * 100}%`, background: status.color }} title={`${status.name}: ${count}`} />
                ) : null,
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {byStatus.map(({ status, count }) => (
                <span key={status.id} className="flex items-center gap-1.5">
                  <Dot color={status.color} />
                  {status.name} <span className="text-muted">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Due this week" action={<Link href={`${base}/tasks`} className="text-xs text-brand">All tasks</Link>} />
          {upcoming.length === 0 && overdue.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing due in the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...overdue, ...upcoming].slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <TaskRef projectKey={ctx.project.key} number={t.number} />
                  <Link href={`${base}/tasks/${t.number}`} className="min-w-0 flex-1 truncate text-sm hover:text-brand">
                    {t.title}
                  </Link>
                  <StatusPill status={statusById.get(t.status_id ?? "")} />
                  <DueLabel due={t.due_date} done={!!t.completed_at} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          {activity.length === 0 ? (
            <p className="p-4 text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <Avatar name={displayName(a.actor)} src={a.actor?.avatar_url} size={24} />
                  <p className="min-w-0 flex-1">
                    <span className="font-medium">{displayName(a.actor)}</span> {a.summary}
                  </p>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        {financials && <BudgetCard f={financials} />}
        <Card>
          <CardHeader title="Milestones" />
          {milestones.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No milestones" />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {milestones.map((m) => {
                const mt = tasks.filter((t) => t.milestone_id === m.id);
                const md = mt.filter((t) => t.completed_at).length;
                return (
                  <li key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{m.name}</span>
                      {m.status === "done" ? <Badge tone="success">Done</Badge> : <DueLabel due={m.due_date} done={false} />}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {md}/{mt.length} tasks done
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={`People (${members.length})`} />
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={displayName(m.profile)} src={m.profile.avatar_url} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{displayName(m.profile)}</span>
                {m.orgRole && (
                  <Badge tone={m.orgRole.system_key === "client" ? "ember" : "neutral"}>{m.orgRole.name}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
