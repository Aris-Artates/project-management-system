import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getBug, getBugComments, getMyTimer, getProjectMembers, getProjectWork, getTimeEntries } from "@/lib/queries";
import { deleteBug, setBugStatus, updateBug } from "@/lib/actions/bugs";
import { BUG_NEXT, BUG_STATUS, REPRODUCIBILITY, SEVERITY } from "@/lib/bug-meta";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CommentThread } from "@/components/comments";
import { TimeLog } from "@/components/time-log";
import { formatDate } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; key: string; number: string }>;
}): Promise<Metadata> {
  const { org, key, number } = await params;
  const ctx = await getProjectContext(org, key);
  const bug = Number.isInteger(Number(number)) ? await getBug(ctx.project.id, Number(number)) : null;
  return { title: bug ? `${ctx.project.key}-B${bug.number} ${bug.title}` : "Bug" };
}

export default async function BugPage({ params }: PageProps<"/[org]/projects/[key]/bugs/[number]">) {
  const { org: slug, key, number } = await params;
  const ctx = await getProjectContext(slug, key);
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();
  const bug = await getBug(ctx.project.id, n);
  if (!bug) notFound();

  const [members, { tasks, milestones }, comments, entries, timer] = await Promise.all([
    getProjectMembers(ctx.project.id, ctx.org.id),
    getProjectWork(ctx.project.id),
    getBugComments(ctx.project.id, bug.id),
    getTimeEntries({ bugId: bug.id }),
    getMyTimer(ctx.profile.id),
  ]);

  const base = `/${slug}/projects/${ctx.project.key}`;
  const mine = ctx.profile.id === bug.assignee_id || ctx.profile.id === bug.reporter_id;
  const canVerify = ctx.canProject("bug.verify");
  const canEdit = ctx.canProject("bug.edit") || canVerify || mine;
  const team = members.filter((m) => m.orgRole?.system_key !== "client");
  const next = BUG_NEXT[bug.status].filter((s) => !s.verify || canVerify);
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href={`${base}/bugs`} className="hover:text-fg">
              Bugs
            </Link>
            <span>/</span>
            <span className="font-mono">
              {ctx.project.key}-B{bug.number}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{bug.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={BUG_STATUS[bug.status].tone}>{BUG_STATUS[bug.status].label}</Badge>
            <Badge tone={SEVERITY[bug.severity].tone}>{SEVERITY[bug.severity].label}</Badge>
            <span className="text-sm text-muted">
              Reported by {displayName(bug.reporter)} on {formatDate(bug.created_at)}
            </span>
          </div>
        </div>

        {canEdit && next.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <ActionForm key={s.to} action={setBugStatus} showOk={false}>
                {h("org_slug", slug)}
                {h("bug_id", bug.id)}
                {h("status", s.to)}
                <SubmitButton size="sm" variant={s.to === "reopened" || s.to === "closed" ? "secondary" : "primary"}>
                  {s.label}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        )}

        {canEdit ? (
          <Card>
            <CardHeader title="Details" />
            <ActionForm action={updateBug} className="grid gap-4 p-4 sm:grid-cols-2">
              {h("org_slug", slug)}
              {h("bug_id", bug.id)}
              <Field label="Title" className="sm:col-span-2">
                <Input name="title" defaultValue={bug.title} required maxLength={300} />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={3} defaultValue={bug.description ?? ""} />
              </Field>
              <Field label="Steps to reproduce" className="sm:col-span-2">
                <Textarea name="steps" rows={4} defaultValue={bug.steps ?? ""} />
              </Field>
              <Field label="Severity">
                <Select name="severity" defaultValue={bug.severity}>
                  {Object.entries(SEVERITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Happens">
                <Select name="reproducibility" defaultValue={bug.reproducibility}>
                  {Object.entries(REPRODUCIBILITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select name="assignee_id" defaultValue={bug.assignee_id ?? ""} disabled={!ctx.canProject("bug.assign")}>
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {displayName(m.profile)}
                    </option>
                  ))}
                </Select>
              </Field>
              {!ctx.canProject("bug.assign") && h("assignee_id", bug.assignee_id ?? "")}
              <Field label="Environment">
                <Input name="environment" defaultValue={bug.environment ?? ""} maxLength={500} />
              </Field>
              <Field label="Related task">
                <Select name="task_id" defaultValue={bug.task_id ?? ""}>
                  <option value="">None</option>
                  {tasks
                    .filter((t) => !t.parent_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {ctx.project.key}-{t.number} {t.title}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Milestone">
                <Select name="milestone_id" defaultValue={bug.milestone_id ?? ""}>
                  <option value="">None</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="client_visible" defaultChecked={bug.client_visible} className="accent-[var(--brand)]" />
                Visible to clients on this project
              </label>
              <div className="sm:col-span-2">
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4 text-sm">
            {bug.description && <p className="whitespace-pre-wrap">{bug.description}</p>}
            {bug.steps && (
              <div>
                <p className="text-xs font-medium text-muted">Steps to reproduce</p>
                <p className="whitespace-pre-wrap">{bug.steps}</p>
              </div>
            )}
            {bug.environment && <p className="text-muted">Environment: {bug.environment}</p>}
          </Card>
        )}

        <Card>
          <CardHeader title="Comments" />
          <div className="p-4">
            <CommentThread
              comments={comments}
              orgSlug={slug}
              projectId={ctx.project.id}
              taskId={null}
              bugId={bug.id}
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
          <CardHeader title="Time" />
          <div className="p-4">
            <TimeLog
              orgSlug={slug}
              projectId={ctx.project.id}
              bugId={bug.id}
              entries={entries}
              meId={ctx.profile.id}
              canLog={ctx.canProject("time.log")}
              timerStartedAt={timer?.started_at ?? null}
              timerHere={timer?.bug_id === bug.id}
            />
          </div>
        </Card>
        <Card className="p-4 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted">Happens</dt>
            <dd>{REPRODUCIBILITY[bug.reproducibility]}</dd>
            <dt className="text-muted">Assignee</dt>
            <dd>{bug.assignee ? displayName(bug.assignee) : "None"}</dd>
            {bug.task && (
              <>
                <dt className="text-muted">Task</dt>
                <dd>
                  <Link href={`${base}/tasks/${bug.task.number}`} className="text-brand">
                    {ctx.project.key}-{bug.task.number}
                  </Link>
                </dd>
              </>
            )}
            {bug.fixed_at && (
              <>
                <dt className="text-muted">Fixed</dt>
                <dd>{formatDate(bug.fixed_at)}</dd>
              </>
            )}
            {bug.closed_at && (
              <>
                <dt className="text-muted">Closed</dt>
                <dd>{formatDate(bug.closed_at)}</dd>
              </>
            )}
          </dl>
          {ctx.canProject("bug.delete") && (
            <form action={deleteBug} className="mt-4">
              {h("org_slug", slug)}
              {h("bug_id", bug.id)}
              {h("redirect_to", `${base}/bugs`)}
              <ConfirmButton message="Delete this bug?">Delete bug</ConfirmButton>
            </form>
          )}
        </Card>
      </aside>
    </div>
  );
}
