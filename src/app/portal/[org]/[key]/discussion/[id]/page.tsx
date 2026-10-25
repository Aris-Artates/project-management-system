import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getTopic, getTopicComments } from "@/lib/queries";
import { CommentThread } from "@/components/comments";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, CardHeader, Notice } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default async function PortalTopic({ params }: PageProps<"/portal/[org]/[key]/discussion/[id]">) {
  const { org: slug, key, id } = await params;
  const ctx = await getProjectContext(slug, key);
  const topic = await getTopic(id);
  if (!topic || topic.project_id !== ctx.project.id) notFound();
  const replies = await getTopicComments(ctx.project.id, topic.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href={`/portal/${slug}/${ctx.project.key}`} className="text-sm text-muted hover:text-fg">
        {ctx.project.name}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
        <p className="mt-1 text-sm text-muted">Started {timeAgo(topic.created_at)}</p>
      </div>
      <Card className="flex gap-3 p-4">
        <Avatar name={displayName(topic.author)} src={topic.author?.avatar_url} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{displayName(topic.author)}</p>
          {topic.body.trim() ? <Markdown>{topic.body}</Markdown> : null}
        </div>
      </Card>
      {topic.locked && <Notice tone="neutral">This discussion is closed for replies.</Notice>}
      <Card>
        <CardHeader title={`Replies (${replies.length})`} />
        <div className="p-4">
          <CommentThread
            comments={replies}
            orgSlug={slug}
            projectId={ctx.project.id}
            taskId={null}
            topicId={topic.id}
            meId={ctx.profile.id}
            canComment={ctx.canProject("comment.create") && !topic.locked}
            canDeleteAny={false}
            isClient
            allowInternal={false}
          />
        </div>
      </Card>
    </div>
  );
}
