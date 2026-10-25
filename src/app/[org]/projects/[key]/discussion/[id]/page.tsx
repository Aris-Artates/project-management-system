import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectContext, displayName } from "@/lib/session";
import { getTopic, getTopicComments } from "@/lib/queries";
import { deleteTopic, moderateTopic } from "@/lib/actions/forum";
import { CommentThread } from "@/components/comments";
import { ConfirmButton } from "@/components/form";
import { Markdown } from "@/components/markdown";
import { Avatar, Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const topic = await getTopic(id);
  return { title: topic?.title ?? "Topic" };
}

export default async function TopicPage({ params }: PageProps<"/[org]/projects/[key]/discussion/[id]">) {
  const { org: slug, key, id } = await params;
  const ctx = await getProjectContext(slug, key);
  const topic = await getTopic(id);
  if (!topic || topic.project_id !== ctx.project.id) notFound();
  const replies = await getTopicComments(ctx.project.id, topic.id);
  const base = `/${slug}/projects/${ctx.project.key}/discussion`;
  const canModerate = ctx.canProject("forum.moderate");
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href={base} className="text-sm text-muted hover:text-fg">
        All topics
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {topic.pinned && <Badge tone="brand">Pinned</Badge>}
            {topic.locked && <Badge>Locked</Badge>}
            {!topic.client_visible && <Badge>Team only</Badge>}
            <span>Started {timeAgo(topic.created_at)}</span>
          </div>
        </div>
        {canModerate && (
          <div className="flex gap-2">
            <form action={moderateTopic}>
              {h("org_slug", slug)}
              {h("topic_id", topic.id)}
              {h("field", "pinned")}
              {h("value", String(!topic.pinned))}
              <Button size="sm" variant="secondary">
                {topic.pinned ? "Unpin" : "Pin"}
              </Button>
            </form>
            <form action={moderateTopic}>
              {h("org_slug", slug)}
              {h("topic_id", topic.id)}
              {h("field", "locked")}
              {h("value", String(!topic.locked))}
              <Button size="sm" variant="secondary">
                {topic.locked ? "Unlock" : "Lock"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <Card className="flex gap-3 p-4">
        <Avatar name={displayName(topic.author)} src={topic.author?.avatar_url} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{displayName(topic.author)}</p>
          {topic.body.trim() ? <Markdown>{topic.body}</Markdown> : <p className="text-sm text-muted">No message.</p>}
        </div>
      </Card>

      {topic.locked && <Notice tone="neutral">This topic is locked. Only moderators can reply.</Notice>}

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
            canComment={ctx.canProject("comment.create") && (!topic.locked || canModerate)}
            canDeleteAny={ctx.canProject("comment.delete_any")}
            isClient={false}
            allowInternal={topic.client_visible}
          />
        </div>
      </Card>

      {(topic.author_id === ctx.profile.id || canModerate) && (
        <form action={deleteTopic}>
          {h("org_slug", slug)}
          {h("topic_id", topic.id)}
          {h("base", base)}
          <ConfirmButton message="Delete this topic and all replies?" variant="ghost">
            Delete topic
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
