import { addComment, deleteComment } from "@/lib/actions/comments";
import type { CommentRow } from "@/lib/queries";
import { displayName } from "@/lib/session";
import { timeAgo } from "@/lib/utils";
import { ActionForm, SubmitButton } from "./form";
import { Avatar, Badge, Textarea } from "./ui";
import { LockIcon } from "./icons";

export function CommentThread({
  comments,
  orgSlug,
  projectId,
  taskId,
  bugId,
  meId,
  canComment,
  canDeleteAny,
  isClient,
  allowInternal,
}: {
  comments: CommentRow[];
  orgSlug: string;
  projectId: string;
  taskId: string | null;
  bugId?: string;
  meId: string;
  canComment: boolean;
  canDeleteAny: boolean;
  isClient: boolean;
  allowInternal: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
      {comments.map((c) => (
        <div key={c.id} className={`flex gap-3 ${c.is_internal ? "rounded-lg bg-warning-soft/50 p-2 -m-2" : ""}`}>
          <Avatar name={displayName(c.author)} src={c.author?.avatar_url} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{displayName(c.author)}</span>
              <span className="text-xs text-muted">{timeAgo(c.created_at)}</span>
              {c.edited_at && <span className="text-xs text-muted">(edited)</span>}
              {c.is_internal && (
                <Badge tone="warning">
                  <LockIcon size={11} /> Internal
                </Badge>
              )}
              {(c.author_id === meId || canDeleteAny) && (
                <form action={deleteComment} className="ml-auto">
                  <input type="hidden" name="comment_id" value={c.id} />
                  <input type="hidden" name="org_slug" value={orgSlug} />
                  <button className="text-xs text-muted hover:text-danger">Delete</button>
                </form>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
          </div>
        </div>
      ))}

      {canComment && (
        <ActionForm action={addComment} resetOnSuccess showOk={false} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="org_slug" value={orgSlug} />
          <input type="hidden" name="project_id" value={projectId} />
          {taskId && <input type="hidden" name="task_id" value={taskId} />}
          {bugId && <input type="hidden" name="bug_id" value={bugId} />}
          <Textarea name="body" rows={3} placeholder={isClient ? "Write a message" : "Write a comment. Use @name to mention someone."} required />
          <div className="flex items-center gap-3">
            {allowInternal && !isClient && (
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <input type="checkbox" name="is_internal" className="accent-[var(--warning)]" /> Internal note (hidden from clients)
              </label>
            )}
            <SubmitButton size="sm" className="ml-auto" pendingText="Posting...">
              Post
            </SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
