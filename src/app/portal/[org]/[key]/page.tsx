import Link from "next/link";
import { getProjectContext } from "@/lib/session";
import { getAttachments, getBugs, getComments, getDocs, getEvents, getProjectWork, getTopics } from "@/lib/queries";
import { createTopic } from "@/lib/actions/forum";
import { LocalTime } from "@/components/local-time";
import { approveTask, createTask } from "@/lib/actions/tasks";
import { reportBug } from "@/lib/actions/bugs";
import { BUG_STATUS, SEVERITY } from "@/lib/bug-meta";
import { ActionForm, SubmitButton } from "@/components/form";
import { AttachmentList } from "@/components/attachment-list";
import { CommentThread } from "@/components/comments";
import { FileUpload } from "@/components/file-upload";
import { DueLabel, StatusPill } from "@/components/project-bits";
import { Badge, Button, Card, CardHeader, Dot, Input, Select, Textarea } from "@/components/ui";
import { formatDate, isoInDays } from "@/lib/utils";

export default async function PortalProject({ params }: PageProps<"/portal/[org]/[key]">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const [{ tasks, statuses, milestones }, files, comments, bugs, docs, topics, events] = await Promise.all([
    getProjectWork(ctx.project.id),
    getAttachments(ctx.project.id),
    getComments(ctx.project.id, null),
    getBugs(ctx.project.id),
    getDocs(ctx.project.id),
    getTopics(ctx.project.id),
    getEvents({ projectId: ctx.project.id, from: isoInDays(0), to: isoInDays(60) }),
  ]);
  const top = tasks.filter((t) => !t.parent_id);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const done = top.filter((t) => t.completed_at).length;
  const pct = top.length ? Math.round((done / top.length) * 100) : 0;
  const waiting = top.filter((t) => !t.completed_at && statusById.get(t.status_id ?? "")?.name.toLowerCase().includes("review"));
  const base = `/portal/${slug}/${ctx.project.key}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/portal/${slug}`} className="text-sm text-muted hover:text-fg">
          All projects
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <Dot color={ctx.project.color} className="size-3" />
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.project.name}</h1>
        </div>
        {ctx.project.description && <p className="mt-1 text-sm text-muted">{ctx.project.description}</p>}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 max-w-sm flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ctx.project.color }} />
          </div>
          <span className="text-sm text-muted">
            {pct}% complete{ctx.project.end_date ? `, target ${formatDate(ctx.project.end_date)}` : ""}
          </span>
        </div>
      </div>

      {waiting.length > 0 && (
        <Card className="border-ember/50">
          <CardHeader title="Waiting for your review" description="Approve when you are happy with the work." />
          <ul className="divide-y divide-line">
            {waiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link href={`${base}/tasks/${t.number}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                  {t.title}
                </Link>
                <form action={approveTask}>
                  <input type="hidden" name="task_id" value={t.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <Button size="sm">Approve</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader title="Work items" />
          {top.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing shared yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {top.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Link href={`${base}/tasks/${t.number}`} className="min-w-0 flex-1 truncate text-sm hover:text-brand">
                    {t.title}
                  </Link>
                  <StatusPill status={statusById.get(t.status_id ?? "")} />
                  <DueLabel due={t.due_date} done={!!t.completed_at} />
                </li>
              ))}
            </ul>
          )}
          {ctx.canProject("task.create") && (
            <ActionForm action={createTask} resetOnSuccess className="flex flex-col gap-2 border-t border-line p-4">
              <input type="hidden" name="org_slug" value={slug} />
              <input type="hidden" name="project_id" value={ctx.project.id} />
              <p className="text-sm font-medium">Send a request</p>
              <Input name="title" placeholder="What do you need?" required maxLength={300} />
              <Textarea name="description" rows={3} placeholder="Details (optional)" />
              <div>
                <SubmitButton size="sm">Send request</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>

        <Card className="self-start">
          <CardHeader title="Milestones" />
          {milestones.length === 0 ? (
            <p className="p-4 text-sm text-muted">No milestones shared.</p>
          ) : (
            <ul className="divide-y divide-line">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>{m.name}</span>
                  {m.status === "done" ? <Badge tone="success">Done</Badge> : <DueLabel due={m.due_date} done={false} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader title="Pages" />
          {docs.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing shared yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`${base}/docs/${d.id}`} className="block truncate px-4 py-2.5 text-sm hover:text-brand">
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Discussions" />
          {topics.length === 0 ? (
            <p className="p-4 text-sm text-muted">No discussions yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {topics.map((t) => (
                <li key={t.id}>
                  <Link href={`${base}/discussion/${t.id}`} className="block px-4 py-2.5 text-sm hover:text-brand">
                    <span className="block truncate">{t.title}</span>
                    <span className="text-xs text-muted">
                      {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {ctx.canProject("forum.post") && (
            <ActionForm action={createTopic} resetOnSuccess className="flex flex-col gap-2 border-t border-line p-3">
              <input type="hidden" name="org_slug" value={slug} />
              <input type="hidden" name="project_id" value={ctx.project.id} />
              <input type="hidden" name="base" value={`${base}/discussion`} />
              <Input name="title" placeholder="Start a discussion" required maxLength={200} className="h-9" />
              <Textarea name="body" rows={2} placeholder="Message (optional)" className="min-h-0" />
              <div>
                <SubmitButton size="sm">Post</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming meetings" />
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <span className="block font-medium">{e.title}</span>
                  <span className="text-xs text-muted">
                    <LocalTime iso={e.starts_at} mode={e.all_day ? "date" : "datetime"} />
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {ctx.feature("bugs") && (
      <Card>
        <CardHeader title="Reported issues" />
        {bugs.length === 0 ? (
          <p className="p-4 text-sm text-muted">No issues reported.</p>
        ) : (
          <ul className="divide-y divide-line">
            {bugs.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Link href={`${base}/bugs/${b.number}`} className="min-w-0 flex-1 truncate text-sm hover:text-brand">
                  {b.title}
                </Link>
                <Badge tone={BUG_STATUS[b.status].tone}>{BUG_STATUS[b.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
        {ctx.canProject("bug.create") && (
          <ActionForm action={reportBug} resetOnSuccess className="flex flex-col gap-2 border-t border-line p-4">
            <input type="hidden" name="org_slug" value={slug} />
            <input type="hidden" name="project_id" value={ctx.project.id} />
            <input type="hidden" name="redirect_base" value={`${base}/bugs`} />
            <p className="text-sm font-medium">Report an issue</p>
            <Input name="title" placeholder="What is not working?" required maxLength={300} />
            <Textarea name="steps" rows={3} placeholder="How can we see it happen?" />
            <div className="flex flex-wrap gap-2">
              <Select name="severity" defaultValue="major" className="w-auto">
                {Object.entries(SEVERITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <Input name="environment" placeholder="Browser or device" className="min-w-40 flex-1" maxLength={500} />
              <SubmitButton size="sm">Report</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>
      )}

      <Card>
        <CardHeader
          title="Shared files"
          action={ctx.canProject("file.upload") ? <FileUpload orgId={ctx.org.id} projectId={ctx.project.id} showVisibility={false} defaultClientVisible /> : undefined}
        />
        <div className="px-4 py-2">
          <AttachmentList files={files} orgSlug={slug} meId={ctx.profile.id} canDeleteAny={false} isClient taskHref={(n) => `${base}/tasks/${n}`} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Conversation" />
        <div className="p-4">
          <CommentThread
            comments={comments}
            orgSlug={slug}
            projectId={ctx.project.id}
            taskId={null}
            meId={ctx.profile.id}
            canComment={ctx.canProject("comment.create")}
            canDeleteAny={false}
            isClient
            allowInternal={false}
          />
        </div>
      </Card>
    </div>
  );
}
