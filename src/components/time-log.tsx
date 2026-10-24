import { deleteTimeEntry, logTime, startTimer, stopTimer } from "@/lib/actions/time";
import type { TimeRow } from "@/lib/queries";
import { displayName } from "@/lib/session";
import { formatDate, todayISO } from "@/lib/utils";
import { ActionForm, SubmitButton } from "./form";
import { Badge, Button, Input } from "./ui";
import { ElapsedClock } from "./elapsed-clock";
import type { Tone } from "./ui";

export const TIME_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

// Time section for a task or bug: running timer, quick log form and entries.
export function TimeLog({
  orgSlug,
  projectId,
  taskId,
  bugId,
  entries,
  meId,
  canLog,
  timerStartedAt,
  timerHere,
  estimateHours,
}: {
  orgSlug: string;
  projectId: string;
  taskId?: string;
  bugId?: string;
  entries: TimeRow[];
  meId: string;
  canLog: boolean;
  timerStartedAt: string | null;
  timerHere: boolean;
  estimateHours?: number | null;
}) {
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const h = (name: string, value?: string) => (value ? <input type="hidden" name={name} value={value} /> : null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-semibold">{formatMinutes(total)}</span> logged
        {estimateHours ? <span className="text-muted"> of {estimateHours}h estimated</span> : null}
      </p>
      {canLog && (
        <div className="flex flex-wrap items-center gap-2">
          {timerHere && timerStartedAt ? (
            <form action={stopTimer} className="flex items-center gap-2">
              {h("org_slug", orgSlug)}
              <span className="font-mono text-sm text-ember">
                <ElapsedClock since={timerStartedAt} />
              </span>
              <Button size="sm" variant="danger">
                Stop timer
              </Button>
            </form>
          ) : (
            <form action={startTimer}>
              {h("org_slug", orgSlug)}
              {h("project_id", projectId)}
              {h("task_id", taskId)}
              {h("bug_id", bugId)}
              <Button size="sm" variant="secondary">
                {timerStartedAt ? "Switch timer here" : "Start timer"}
              </Button>
            </form>
          )}
          <ActionForm action={logTime} resetOnSuccess showOk={false} className="flex flex-wrap items-center gap-2">
            {h("org_slug", orgSlug)}
            {h("project_id", projectId)}
            {h("task_id", taskId)}
            {h("bug_id", bugId)}
            <Input name="duration" placeholder="1:30" className="h-8 w-20" required aria-label="Duration" />
            <Input name="work_date" type="date" defaultValue={todayISO()} className="h-8 w-auto" aria-label="Date" />
            <Input name="note" placeholder="Note" className="h-8 w-40" maxLength={500} />
            <SubmitButton size="sm" variant="secondary">
              Log
            </SubmitButton>
          </ActionForm>
        </div>
      )}
      {entries.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="w-16 font-medium">{formatMinutes(e.minutes)}</span>
              <span className="text-muted">{displayName(e.person)}</span>
              <span className="text-muted">{formatDate(e.work_date)}</span>
              <span className="min-w-0 flex-1 truncate">{e.note}</span>
              <Badge tone={TIME_STATUS[e.status]!.tone}>{TIME_STATUS[e.status]!.label}</Badge>
              {e.user_id === meId && (e.status === "draft" || e.status === "rejected") && (
                <form action={deleteTimeEntry}>
                  {h("entry_id", e.id)}
                  {h("org_slug", orgSlug)}
                  <button className="text-xs text-muted hover:text-danger">Delete</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
