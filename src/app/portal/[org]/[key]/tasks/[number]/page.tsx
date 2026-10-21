import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectContext } from "@/lib/session";
import { getAttachments, getComments, getProjectWork, getTask } from "@/lib/queries";
import { approveTask } from "@/lib/actions/tasks";
import { AttachmentList } from "@/components/attachment-list";
import { CommentThread } from "@/components/comments";
import { FileUpload } from "@/components/file-upload";
import { DueLabel, StatusPill } from "@/components/project-bits";
import { Button, Card, CardHeader } from "@/components/ui";

export default async function PortalTask({ params }: PageProps<"/portal/[org]/[key]/tasks/[number]">) {
  const { org: slug, key, number } = await params;
  const ctx = await getProjectContext(slug, key);
  const task = await getTask(ctx.project.id, Number(number));
  if (!task) notFound();
  const [{ statuses }, comments, files] = await Promise.all([
    getProjectWork(ctx.project.id),
    getComments(ctx.project.id, task.id),
    getAttachments(ctx.project.id, task.id),
  ]);
  const status = statuses.find((s) => s.id === task.status_id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/portal/${slug}/${ctx.project.key}`} className="text-sm text-muted hover:text-fg">
          {ctx.project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <StatusPill status={status} />
          {task.due_date && (
            <span className="text-muted">
              Due <DueLabel due={task.due_date} done={!!task.completed_at} />
            </span>
          )}
          {!task.completed_at && status?.category === "in_progress" && (
            <form action={approveTask} className="ml-auto">
              <input type="hidden" name="task_id" value={task.id} />
              <input type="hidden" name="org_slug" value={slug} />
              <Button size="sm">Approve</Button>
            </form>
          )}
        </div>
      </div>

      {task.description && (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-sm">{task.description}</p>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Files"
          action={
            ctx.canProject("file.upload") ? (
              <FileUpload orgId={ctx.org.id} projectId={ctx.project.id} taskId={task.id} showVisibility={false} defaultClientVisible />
            ) : undefined
          }
        />
        <div className="px-4 py-2">
          <AttachmentList files={files} orgSlug={slug} meId={ctx.profile.id} canDeleteAny={false} isClient />
        </div>
      </Card>

      <Card>
        <CardHeader title="Comments" />
        <div className="p-4">
          <CommentThread
            comments={comments}
            orgSlug={slug}
            projectId={ctx.project.id}
            taskId={task.id}
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
