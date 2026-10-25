import Link from "next/link";
import { getProjectContext, displayName } from "@/lib/session";
import { getComments, getTopics } from "@/lib/queries";
import { createTopic } from "@/lib/actions/forum";
import { CommentThread } from "@/components/comments";
import { ActionForm, SubmitButton } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { EyeIcon, LockIcon } from "@/components/icons";
import { timeAgo } from "@/lib/utils";

export default async function DiscussionPage({ params }: PageProps<"/[org]/projects/[key]/discussion">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const [topics, comments] = await Promise.all([getTopics(ctx.project.id), getComments(ctx.project.id, null)]);
  const base = `/${slug}/projects/${ctx.project.key}/discussion`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader title={`Topics (${topics.length})`} description="Longer conversations, one subject each." />
          {topics.length === 0 ? (
            <p className="p-4 text-sm text-muted">No topics yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {topics.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={displayName(t.author)} src={t.author?.avatar_url} size={30} />
                  <div className="min-w-0 flex-1">
                    <Link href={`${base}/${t.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                      {t.pinned && <Badge tone="brand">Pinned</Badge>}
                      <span className="truncate">{t.title}</span>
                      {t.locked && (
                        <span className="text-muted" title="Locked">
                          <LockIcon size={12} />
                        </span>
                      )}
                    </Link>
                    <p className="text-xs text-muted">
                      {displayName(t.author)} · {t.reply_count} repl{t.reply_count === 1 ? "y" : "ies"} · active {timeAgo(t.last_activity_at)}
                    </p>
                  </div>
                  {t.client_visible ? (
                    <span className="text-ember" title="Clients can read and reply">
                      <EyeIcon />
                    </span>
                  ) : (
                    <Badge>Team only</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="General thread" description="Quick updates for everyone on the project, except internal notes." />
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
      </div>

      {ctx.canProject("forum.post") && (
        <Card className="self-start">
          <CardHeader title="Start a topic" />
          <ActionForm action={createTopic} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="org_slug" value={slug} />
            <input type="hidden" name="project_id" value={ctx.project.id} />
            <input type="hidden" name="base" value={base} />
            <Field label="Title">
              <Input name="title" required maxLength={200} />
            </Field>
            <Field label="Message">
              <Textarea name="body" rows={5} maxLength={20000} />
            </Field>
            <input type="hidden" name="client_visible" value="false" />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="client_visible" value="true" defaultChecked className="accent-[var(--brand)]" /> Clients can read and reply
            </label>
            <SubmitButton>Post topic</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
