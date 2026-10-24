import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectContext } from "@/lib/session";
import { getBug, getBugComments } from "@/lib/queries";
import { BUG_STATUS, SEVERITY } from "@/lib/bug-meta";
import { CommentThread } from "@/components/comments";
import { Badge, Card, CardHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function PortalBug({ params }: PageProps<"/portal/[org]/[key]/bugs/[number]">) {
  const { org: slug, key, number } = await params;
  const ctx = await getProjectContext(slug, key);
  const bug = Number.isInteger(Number(number)) ? await getBug(ctx.project.id, Number(number)) : null;
  if (!bug) notFound();
  const comments = await getBugComments(ctx.project.id, bug.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/portal/${slug}/${ctx.project.key}`} className="text-sm text-muted hover:text-fg">
          {ctx.project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{bug.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={BUG_STATUS[bug.status].tone}>{BUG_STATUS[bug.status].label}</Badge>
          <Badge tone={SEVERITY[bug.severity].tone}>{SEVERITY[bug.severity].label}</Badge>
          <span className="text-muted">Reported {formatDate(bug.created_at)}</span>
        </div>
      </div>

      {(bug.steps || bug.description || bug.environment) && (
        <Card className="flex flex-col gap-2 p-4 text-sm">
          {bug.description && <p className="whitespace-pre-wrap">{bug.description}</p>}
          {bug.steps && <p className="whitespace-pre-wrap">{bug.steps}</p>}
          {bug.environment && <p className="text-muted">Environment: {bug.environment}</p>}
        </Card>
      )}

      <Card>
        <CardHeader title="Conversation" />
        <div className="p-4">
          <CommentThread
            comments={comments}
            orgSlug={slug}
            projectId={ctx.project.id}
            taskId={null}
            bugId={bug.id}
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
