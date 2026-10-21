import Link from "next/link";
import { deleteAttachment, setAttachmentVisibility } from "@/lib/actions/comments";
import type { AttachmentRow } from "@/lib/queries";
import { displayName } from "@/lib/session";
import { formatBytes, timeAgo } from "@/lib/utils";
import { AutoSubmitCheckbox } from "./form";
import { ClipIcon } from "./icons";

export function AttachmentList({
  files,
  orgSlug,
  meId,
  canDeleteAny,
  isClient,
  taskHref,
}: {
  files: AttachmentRow[];
  orgSlug: string;
  meId: string;
  canDeleteAny: boolean;
  isClient: boolean;
  taskHref?: (n: number) => string;
}) {
  if (!files.length) return <p className="text-sm text-muted">No files yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {files.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
          <ClipIcon />
          <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
            {f.file_name}
          </a>
          {f.task && taskHref && (
            <Link href={taskHref(f.task.number)} className="max-w-40 truncate text-xs text-muted hover:text-brand">
              #{f.task.number} {f.task.title}
            </Link>
          )}
          <span className="text-xs text-muted">{formatBytes(f.size_bytes)}</span>
          <span className="text-xs text-muted">
            {displayName(f.uploader)}, {timeAgo(f.created_at)}
          </span>
          {!isClient && (
            <form action={setAttachmentVisibility} className="flex items-center gap-1 text-xs text-muted">
              <input type="hidden" name="attachment_id" value={f.id} />
              <input type="hidden" name="org_slug" value={orgSlug} />
              <input type="hidden" name="client_visible" value={f.client_visible ? "false" : "true"} />
              <label className="flex items-center gap-1">
                <AutoSubmitCheckbox defaultChecked={f.client_visible} className="accent-[var(--brand)]" />
                Client
              </label>
            </form>
          )}
          {(f.uploaded_by === meId || canDeleteAny) && (
            <form action={deleteAttachment}>
              <input type="hidden" name="attachment_id" value={f.id} />
              <input type="hidden" name="org_slug" value={orgSlug} />
              <button className="text-xs text-muted hover:text-danger">Delete</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
