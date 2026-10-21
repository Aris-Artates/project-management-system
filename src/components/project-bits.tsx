import Link from "next/link";
import type { Tone } from "./ui";
import { Avatar, Badge, Dot } from "./ui";
import type { TaskRow } from "@/lib/queries";
import type { Tag, TaskStatus } from "@/lib/types";
import { cn, formatDate, isOverdue, PRIORITY_STYLE } from "@/lib/utils";
import { displayName } from "@/lib/session";

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "brand" },
  on_hold: { label: "On hold", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

export function StatusPill({ status }: { status: TaskStatus | undefined }) {
  if (!status) return <Badge>No status</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <Dot color={status.color} className="size-2" />
      {status.name}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: string }) {
  if (priority === "none") return null;
  return <span className={cn("text-xs font-medium capitalize", PRIORITY_STYLE[priority])}>{priority}</span>;
}

export function DueLabel({ due, done }: { due: string | null; done: boolean }) {
  if (!due) return null;
  const late = isOverdue(due, done);
  return <span className={cn("text-xs whitespace-nowrap", late ? "font-medium text-danger" : "text-muted")}>{formatDate(due)}</span>;
}

export function AssigneeStack({ assignees, max = 3 }: { assignees: TaskRow["assignees"]; max?: number }) {
  if (!assignees.length) return null;
  return (
    <span className="flex -space-x-1.5">
      {assignees.slice(0, max).map((a) => (
        <Avatar key={a.user_id} name={displayName(a.profile)} src={a.profile.avatar_url} size={22} className="ring-2 ring-surface" />
      ))}
      {assignees.length > max && <span className="pl-2 text-xs text-muted">+{assignees.length - max}</span>}
    </span>
  );
}

export function TagChips({ ids, tags }: { ids: string[]; tags: Tag[] }) {
  const list = tags.filter((t) => ids.includes(t.id));
  if (!list.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {list.map((t) => (
        <span key={t.id} className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: t.color + "22", color: t.color }}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

export function TaskRef({ projectKey, number, href }: { projectKey: string; number: number; href?: string }) {
  const label = `${projectKey}-${number}`;
  return href ? (
    <Link href={href} className="font-mono text-xs text-muted hover:text-brand">
      {label}
    </Link>
  ) : (
    <span className="font-mono text-xs text-muted">{label}</span>
  );
}
