import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getAttachments, getComments, getProjectMembers, getProjectWork, getSubtasks, getTask, getTaskSummary } from "@/lib/queries";
import { addAssignee, deleteTask, patchTask, removeAssignee, toggleTag, toggleTaskDone, updateTask } from "@/lib/actions/tasks";
import { ActionForm, AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CommentThread } from "@/components/comments";
import { AttachmentList } from "@/components/attachment-list";
import { FileUpload } from "@/components/file-upload";
import { NewTaskForm } from "@/components/new-task-form";
import { DueLabel, PriorityLabel, StatusPill, TaskRef } from "@/components/project-bits";
import { EyeIcon } from "@/components/icons";
import { cn, formatDate, PRIORITIES } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; key: string; number: string }>;
}): Promise<Metadata> {
  const { org, key, number } = await params;
  const ctx = await getProjectContext(org, key);
  const task = Number.isInteger(Number(number)) ? await getTask(ctx.project.id, Number(number)) : null;
  return { title: task ? `${ctx.project.key}-${task.number} ${task.title}` : ctx.project.name };
}

export default async function TaskPage({ params }: PageProps<"/[org]/projects/[key]/tasks/[number]">) {
  const { org: slug, key, number } = await params;
  const ctx = await getProjectContext(slug, key);
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();
  const task = await getTask(ctx.project.id, n);
  if (!task) notFound();

  const base = `/${slug}/projects/${ctx.project.key}`;
  const [{ statuses, lists, tags, milestones }, members, subtasks, comments, files, parent] = await Promise.all([
    getProjectWork(ctx.project.id),
    getProjectMembers(ctx.project.id, ctx.org.id),
    getSubtasks(task.id),
    getComments(ctx.project.id, task.id),
    getAttachments(ctx.project.id, task.id),
    task.parent_id ? getTaskSummary(task.parent_id) : Promise.resolve(null),
  ]);

  const mine = task.created_by === ctx.profile.id || task.assignees.some((a) => a.user_id === ctx.profile.id);
  const canEdit = ctx.canProject("task.edit") || (ctx.canProject("task.edit_own") && mine);
  const canAssign = ctx.canProject("task.assign");
  const status = statuses.find((s) => s.id === task.status_id);
  const team = members.filter((m) => m.orgRole?.system_key !== "client");
  const unassigned = team.filter((m) => !task.assignees.some((a) => a.user_id === m.user_id));
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href={`${base}/tasks`} className="hover:text-fg">
              Tasks
            </Link>
            <span>/</span>
            {parent && (
              <>
                <Link href={`${base}/tasks/${parent.number}`} className="hover:text-fg">
                  {ctx.project.key}-{parent.number}
                </Link>
                <span>/</span>
              </>
            )}
            <TaskRef projectKey={ctx.project.key} number={task.number} />
            {task.client_visible && (
              <Badge tone="ember">
                <EyeIcon size={12} /> Client can see
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-start gap-3">
            <form action={toggleTaskDone} className="pt-1.5">
              {hidden("task_id", task.id)}
              {hidden("org_slug", slug)}
              <button
                disabled={!canEdit}
                aria-label={task.completed_at ? "Reopen task" : "Complete task"}
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-xs",
                  task.completed_at ? "border-success bg-success text-white" : "border-line-strong hover:border-brand",
                )}
              >
                {task.completed_at ? "✓" : ""}
              </button>
            </form>
            <h1 className={cn("text-2xl font-semibold tracking-tight", task.completed_at && "text-muted line-through")}>{task.title}</h1>
          </div>
        </div>

        {canEdit ? (
          <Card>
            <CardHeader title="Details" />
            <ActionForm action={updateTask} className="grid gap-4 p-4 sm:grid-cols-2">
              {hidden("task_id", task.id)}
              {hidden("org_slug", slug)}
              <Field label="Title" className="sm:col-span-2">
                <Input name="title" defaultValue={task.title} required maxLength={300} />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={6} defaultValue={task.description ?? ""} />
              </Field>
              <Field label="Status">
                <Select name="status_id" defaultValue={task.status_id ?? ""}>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select name="priority" defaultValue={task.priority}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p === "none" ? "No priority" : p[0]!.toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="List">
                <Select name="list_id" defaultValue={task.list_id ?? ""}>
                  <option value="">No list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Milestone">
                <Select name="milestone_id" defaultValue={task.milestone_id ?? ""}>
                  <option value="">None</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start date">
                <Input name="start_date" type="date" defaultValue={task.start_date ?? ""} />
              </Field>
              <Field label="Due date">
                <Input name="due_date" type="date" defaultValue={task.due_date ?? ""} />
              </Field>
              <Field label="Estimate (hours)">
                <Input name="estimate_hours" type="number" min={0} step={0.25} defaultValue={task.estimate_hours ?? ""} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="client_visible" defaultChecked={task.client_visible} className="accent-[var(--brand)]" />
                Visible to clients on this project
              </label>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : (
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm">{task.description || <span className="text-muted">No description.</span>}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Status</dt>
                <dd>
                  <StatusPill status={status} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Priority</dt>
                <dd>
                  <PriorityLabel priority={task.priority} /> {task.priority === "none" && "None"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Start</dt>
                <dd>{formatDate(task.start_date) || "None"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Due</dt>
                <dd>{task.due_date ? <DueLabel due={task.due_date} done={!!task.completed_at} /> : "None"}</dd>
              </div>
            </dl>
          </Card>
        )}

        {!task.parent_id && (
          <Card>
            <CardHeader title={`Subtasks (${subtasks.filter((s) => s.completed_at).length}/${subtasks.length})`} />
            <ul className="divide-y divide-line">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <TaskRef projectKey={ctx.project.key} number={s.number} />
                  <Link href={`${base}/tasks/${s.number}`} className={cn("min-w-0 flex-1 truncate text-sm hover:text-brand", s.completed_at && "text-muted line-through")}>
                    {s.title}
                  </Link>
                  <StatusPill status={statuses.find((x) => x.id === s.status_id)} />
                </li>
              ))}
            </ul>
            {ctx.canProject("task.create") && (
              <div className="border-t border-line p-3">
                <NewTaskForm
                  orgSlug={slug}
                  projectId={ctx.project.id}
                  lists={lists}
                  statuses={statuses}
                  members={members}
                  milestones={milestones}
                  canAssign={canAssign}
                  defaultListId={task.list_id ?? undefined}
                  parentId={task.id}
                  compact
                />
              </div>
            )}
          </Card>
        )}

        <Card>
          <CardHeader title={`Files (${files.length})`} />
          <div className="px-4 py-2">
            <AttachmentList files={files} orgSlug={slug} meId={ctx.profile.id} canDeleteAny={ctx.canProject("file.delete_any")} isClient={false} />
          </div>
          {ctx.canProject("file.upload") && (
            <div className="border-t border-line p-3">
              <FileUpload orgId={ctx.org.id} projectId={ctx.project.id} taskId={task.id} defaultClientVisible={task.client_visible} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Comments" description={task.client_visible ? "Clients can read comments that are not marked internal." : undefined} />
          <div className="p-4">
            <CommentThread
              comments={comments}
              orgSlug={slug}
              projectId={ctx.project.id}
              taskId={task.id}
              meId={ctx.profile.id}
              canComment={ctx.canProject("comment.create")}
              canDeleteAny={ctx.canProject("comment.delete_any")}
              isClient={false}
              allowInternal
            />
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Status" />
          <div className="p-4">
            {canEdit ? (
              <form action={patchTask}>
                {hidden("task_id", task.id)}
                {hidden("org_slug", slug)}
                {hidden("field", "status_id")}
                <AutoSubmitSelect
                  name="value"
                  defaultValue={task.status_id ?? ""}
                  className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm"
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
            ) : (
              <StatusPill status={status} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Assignees" />
          <div className="flex flex-col gap-2 p-4">
            {task.assignees.length === 0 && <p className="text-sm text-muted">Nobody yet.</p>}
            {task.assignees.map((a) => (
              <div key={a.user_id} className="flex items-center gap-2">
                <Avatar name={displayName(a.profile)} src={a.profile.avatar_url} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm">{displayName(a.profile)}</span>
                {canAssign && (
                  <form action={removeAssignee}>
                    {hidden("task_id", task.id)}
                    {hidden("user_id", a.user_id)}
                    {hidden("org_slug", slug)}
                    <button className="text-xs text-muted hover:text-danger" aria-label="Remove assignee">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
            {canAssign && unassigned.length > 0 && (
              <form action={addAssignee}>
                {hidden("task_id", task.id)}
                {hidden("org_slug", slug)}
                <AutoSubmitSelect
                  name="user_id"
                  defaultValue=""
                  className="mt-1 h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm"
                >
                  <option value="">Add someone...</option>
                  {unassigned.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {displayName(m.profile)}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
            )}
          </div>
        </Card>

        {tags.length > 0 && (
          <Card>
            <CardHeader title="Tags" />
            <div className="flex flex-wrap gap-1.5 p-4">
              {tags.map((t) => {
                const on = task.tags.some((x) => x.tag_id === t.id);
                return canEdit ? (
                  <form key={t.id} action={toggleTag}>
                    {hidden("task_id", task.id)}
                    {hidden("tag_id", t.id)}
                    {hidden("org_slug", slug)}
                    {hidden("on", on ? "false" : "true")}
                    <button
                      className={cn("rounded px-2 py-0.5 text-xs font-medium border", on ? "border-transparent" : "border-line-strong text-muted")}
                      style={on ? { background: t.color + "22", color: t.color } : undefined}
                    >
                      {t.name}
                    </button>
                  </form>
                ) : on ? (
                  <span key={t.id} className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: t.color + "22", color: t.color }}>
                    {t.name}
                  </span>
                ) : null;
              })}
            </div>
          </Card>
        )}

        <Card className="p-4 text-xs text-muted">
          <p>Created {formatDate(task.created_at, { month: "short", day: "numeric", year: "numeric" })}</p>
          {task.completed_at && <p className="mt-1">Completed {formatDate(task.completed_at, { month: "short", day: "numeric", year: "numeric" })}</p>}
          {ctx.canProject("task.delete") && (
            <form action={deleteTask} className="mt-3">
              {hidden("task_id", task.id)}
              {hidden("org_slug", slug)}
              {hidden("redirect_to", parent ? `${base}/tasks/${parent.number}` : `${base}/tasks`)}
              <ConfirmButton message="Delete this task and its subtasks?">Delete task</ConfirmButton>
            </form>
          )}
        </Card>
      </aside>
    </div>
  );
}
