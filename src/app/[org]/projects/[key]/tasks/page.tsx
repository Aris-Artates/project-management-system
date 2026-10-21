import Link from "next/link";
import { getProjectContext } from "@/lib/session";
import { getProjectMembers, getProjectWork, type TaskRow } from "@/lib/queries";
import { toggleTaskDone } from "@/lib/actions/tasks";
import { NewTaskForm } from "@/components/new-task-form";
import { AssigneeStack, DueLabel, PriorityLabel, StatusPill, TagChips, TaskRef } from "@/components/project-bits";
import { Badge, Card, EmptyState, Select } from "@/components/ui";
import { cn, isOverdue } from "@/lib/utils";
import { EyeIcon } from "@/components/icons";

export default async function TasksPage({ params, searchParams }: PageProps<"/[org]/projects/[key]/tasks">) {
  const { org: slug, key } = await params;
  const sp = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const base = `/${slug}/projects/${ctx.project.key}`;
  const [{ tasks, statuses, lists, tags, milestones }, members] = await Promise.all([
    getProjectWork(ctx.project.id),
    getProjectMembers(ctx.project.id, ctx.org.id),
  ]);

  const filter = {
    status: typeof sp.status === "string" ? sp.status : "",
    who: typeof sp.who === "string" ? sp.who : "",
    priority: typeof sp.priority === "string" ? sp.priority : "",
    show: typeof sp.show === "string" ? sp.show : "open",
  };

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const subtasks = new Map<string, TaskRow[]>();
  for (const t of tasks) if (t.parent_id) subtasks.set(t.parent_id, [...(subtasks.get(t.parent_id) ?? []), t]);

  const visible = tasks.filter((t) => {
    if (t.parent_id) return false;
    if (filter.show === "open" && t.completed_at) return false;
    if (filter.show === "overdue" && !isOverdue(t.due_date, !!t.completed_at)) return false;
    if (filter.status && t.status_id !== filter.status) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.who === "me" && !t.assignees.some((a) => a.user_id === ctx.profile.id)) return false;
    if (filter.who === "none" && t.assignees.length) return false;
    if (filter.who && !["me", "none"].includes(filter.who) && !t.assignees.some((a) => a.user_id === filter.who)) return false;
    return true;
  });

  const groups = [
    ...lists.map((l) => ({ id: l.id, name: l.name, tasks: visible.filter((t) => t.list_id === l.id) })),
    { id: "none", name: "No list", tasks: visible.filter((t) => !t.list_id || !lists.some((l) => l.id === t.list_id)) },
  ].filter((g) => g.id !== "none" || g.tasks.length);

  const canEditAny = ctx.canProject("task.edit") || ctx.canProject("task.edit_own");

  return (
    <div className="flex flex-col gap-5">
      {ctx.canProject("task.create") && (
        <Card className="p-3">
          <NewTaskForm
            orgSlug={slug}
            projectId={ctx.project.id}
            lists={lists}
            statuses={statuses}
            members={members}
            milestones={milestones}
            canAssign={ctx.canProject("task.assign")}
          />
        </Card>
      )}

      <form className="flex flex-wrap items-center gap-2 text-sm">
        <Select name="show" defaultValue={filter.show} className="h-9 w-auto">
          <option value="open">Open</option>
          <option value="all">All</option>
          <option value="overdue">Overdue</option>
        </Select>
        <Select name="status" defaultValue={filter.status} className="h-9 w-auto">
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select name="who" defaultValue={filter.who} className="h-9 w-auto">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members
            .filter((m) => m.orgRole?.system_key !== "client")
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile.full_name ?? m.profile.email}
              </option>
            ))}
        </Select>
        <Select name="priority" defaultValue={filter.priority} className="h-9 w-auto">
          <option value="">Any priority</option>
          {["urgent", "high", "medium", "low", "none"].map((p) => (
            <option key={p} value={p} className="capitalize">
              {p}
            </option>
          ))}
        </Select>
        <button className="h-9 rounded-lg border border-line-strong bg-surface px-3 hover:bg-surface-2">Apply</button>
        <Link href={`${base}/tasks`} className="text-muted hover:text-fg">
          Reset
        </Link>
        <span className="ml-auto text-muted">{visible.length} tasks</span>
      </form>

      {groups.every((g) => g.tasks.length === 0) && <EmptyState title="No tasks match">Try a different filter or add a task.</EmptyState>}

      {groups.map((g) =>
        g.tasks.length ? (
          <Card key={g.id}>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-semibold">{g.name}</h2>
              <span className="text-xs text-muted">{g.tasks.length}</span>
            </div>
            <ul className="divide-y divide-line">
              {g.tasks.map((t) => {
                const subs = subtasks.get(t.id) ?? [];
                const subsDone = subs.filter((s) => s.completed_at).length;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                    <form action={toggleTaskDone}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <button
                        disabled={!canEditAny}
                        aria-label={t.completed_at ? "Reopen task" : "Complete task"}
                        className={cn(
                          "flex size-4.5 items-center justify-center rounded-full border text-[10px]",
                          t.completed_at ? "border-success bg-success text-white" : "border-line-strong hover:border-brand",
                        )}
                      >
                        {t.completed_at ? "✓" : ""}
                      </button>
                    </form>
                    <TaskRef projectKey={ctx.project.key} number={t.number} />
                    <Link
                      href={`${base}/tasks/${t.number}`}
                      className={cn("min-w-0 flex-1 truncate text-sm hover:text-brand", t.completed_at && "text-muted line-through")}
                    >
                      {t.title}
                    </Link>
                    {t.client_visible && (
                      <span title="Visible to client" className="text-ember">
                        <EyeIcon />
                      </span>
                    )}
                    <TagChips ids={t.tags.map((x) => x.tag_id)} tags={tags} />
                    {subs.length > 0 && (
                      <Badge>
                        {subsDone}/{subs.length}
                      </Badge>
                    )}
                    <AssigneeStack assignees={t.assignees} />
                    <span className="w-24">
                      <StatusPill status={statusById.get(t.status_id ?? "")} />
                    </span>
                    <span className="w-14">
                      <PriorityLabel priority={t.priority} />
                    </span>
                    <span className="w-14 text-right">
                      <DueLabel due={t.due_date} done={!!t.completed_at} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null,
      )}
    </div>
  );
}
