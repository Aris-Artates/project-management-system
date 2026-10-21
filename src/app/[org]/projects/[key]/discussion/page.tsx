import { getProjectContext } from "@/lib/session";
import { getComments } from "@/lib/queries";
import { CommentThread } from "@/components/comments";
import { Card, CardHeader } from "@/components/ui";

export default async function DiscussionPage({ params }: PageProps<"/[org]/projects/[key]/discussion">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const comments = await getComments(ctx.project.id, null);

  return (
    <Card className="max-w-3xl">
      <CardHeader title="Project discussion" description="Shared with clients on this project, except internal notes." />
      <div className="p-4">
        <CommentThread
          comments={comments}
          orgSlug={slug}
          projectId={ctx.project.id}
          taskId={null}
          meId={ctx.profile.id}
          canComment={ctx.canProject("comment.create")}
          canDeleteAny={ctx.canProject("comment.delete_any")}
          isClient={false}
          allowInternal
        />
      </div>
    </Card>
  );
}
