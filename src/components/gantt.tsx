"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { rescheduleTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

export type GanttTask = {
  id: string;
  number: number;
  title: string;
  start: string | null;
  due: string | null;
  done: boolean;
  color: string;
  depth: number;
};

type Props = {
  tasks: GanttTask[];
  milestones: { id: string; name: string; date: string; done: boolean }[];
  deps: { task_id: string; depends_on_id: string }[];
  editable: string[];
  projectKey: string;
  baseHref: string;
  orgSlug: string;
};

const ROW = 36;
const HEADER = 52;
const DAY_MS = 86400000;

function toDay(iso: string) {
  return Math.round(Date.parse(iso + "T00:00:00Z") / DAY_MS);
}
function fromDay(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
function todayDay() {
  const d = new Date();
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; start: number; end: number };

export function Gantt({ tasks: initial, milestones, deps, editable, projectKey, baseHref, orgSlug }: Props) {
  const [tasks, setTasks] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setTasks(initial);
  }
  const [zoom, setZoom] = useState<"day" | "week">("day");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const dayW = zoom === "day" ? 28 : 10;
  const today = todayDay();

  const scheduled = tasks.filter((t) => t.start || t.due);
  const unscheduled = tasks.filter((t) => !t.start && !t.due);

  const span = (t: GanttTask) => {
    const s = toDay((t.start ?? t.due)!);
    const e = toDay((t.due ?? t.start)!);
    return { start: Math.min(s, e), end: Math.max(s, e) };
  };

  const { from, to } = useMemo(() => {
    const days = [
      today,
      ...scheduled.flatMap((t) => [span(t).start, span(t).end]),
      ...milestones.map((m) => toDay(m.date)),
    ];
    return { from: Math.min(...days) - 7, to: Math.max(...days, today + 35) + 7 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, milestones, today]);

  const width = (to - from + 1) * dayW;
  const rowOf = new Map(scheduled.map((t, i) => [t.id, i]));
  const editableSet = new Set(editable);

  const shownSpan = (t: GanttTask) => (drag?.id === t.id && preview ? preview : span(t));

  function onPointerDown(e: React.PointerEvent, t: GanttTask, mode: Drag["mode"]) {
    if (!editableSet.has(t.id)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Some inputs cannot be captured; moves still arrive on the scroller.
    }
    const s = span(t);
    setDrag({ id: t.id, mode, x0: e.clientX, start: s.start, end: s.end });
    setPreview(s);
    setError(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x0) / dayW);
    if (drag.mode === "move") setPreview({ start: drag.start + delta, end: drag.end + delta });
    else if (drag.mode === "start") setPreview({ start: Math.min(drag.start + delta, drag.end), end: drag.end });
    else setPreview({ start: drag.start, end: Math.max(drag.end + delta, drag.start) });
  }

  function onPointerUp() {
    if (!drag || !preview) return setDrag(null);
    const t = tasks.find((x) => x.id === drag.id)!;
    const changed = preview.start !== drag.start || preview.end !== drag.end;
    setDrag(null);
    setPreview(null);
    if (!changed) return;
    const original = { start: t.start, due: t.due };
    const start = fromDay(preview.start);
    const due = fromDay(preview.end);
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, start, due } : x)));
    startTransition(async () => {
      const err = await rescheduleTask(t.id, start, due, orgSlug);
      if (err) {
        setError(err);
        setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...original } : x)));
      }
    });
  }

  const months: { label: string; x: number; w: number }[] = [];
  for (let d = from; d <= to; d++) {
    const date = new Date(d * DAY_MS);
    if (d === from || date.getUTCDate() === 1) {
      months.push({ label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), x: (d - from) * dayW, w: 0 });
    }
  }
  months.forEach((m, i) => (m.w = (months[i + 1]?.x ?? width) - m.x));

  const height = Math.max(scheduled.length, 1) * ROW;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex rounded-lg border border-line-strong bg-surface p-0.5">
          {(["day", "week"] as const).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn("rounded-md px-3 py-1 capitalize", zoom === z ? "bg-brand text-on-brand" : "text-muted hover:text-fg")}
            >
              {z === "day" ? "Days" : "Weeks"}
            </button>
          ))}
        </div>
        <button
          className="rounded-lg border border-line-strong bg-surface px-3 py-1 hover:bg-surface-2"
          onClick={() => scroller.current?.scrollTo({ left: (today - from - 7) * dayW, behavior: "smooth" })}
        >
          Today
        </button>
        <span className="text-muted">Drag a bar to move it, or its edges to change dates.</span>
        {error && <span className="text-danger">{error}</span>}
      </div>

      <div className="flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="w-56 shrink-0 border-r border-line sm:w-72">
          <div className="flex items-end border-b border-line px-3 pb-2 text-xs font-medium text-muted" style={{ height: HEADER }}>
            Task
          </div>
          {scheduled.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border-b border-line px-3 text-sm" style={{ height: ROW, paddingLeft: 12 + t.depth * 16 }}>
              <span className="font-mono text-xs text-muted">
                {projectKey}-{t.number}
              </span>
              <Link href={`${baseHref}/tasks/${t.number}`} className={cn("truncate hover:text-brand", t.done && "text-muted line-through")}>
                {t.title}
              </Link>
            </div>
          ))}
          {scheduled.length === 0 && <p className="p-3 text-sm text-muted">No tasks have dates yet.</p>}
        </div>

        <div
          ref={scroller}
          className="relative flex-1 overflow-x-auto"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="relative" style={{ width, height: HEADER + height }}>
            {/* Header: months and days */}
            <div className="sticky top-0 z-10 border-b border-line bg-surface" style={{ height: HEADER }}>
              {months.map((m) => (
                <div key={m.x} className="absolute top-0 truncate border-l border-line px-2 pt-1 text-xs font-medium" style={{ left: m.x, width: m.w }}>
                  {m.label}
                </div>
              ))}
              {Array.from({ length: to - from + 1 }, (_, i) => {
                const date = new Date((from + i) * DAY_MS);
                const show = zoom === "day" || date.getUTCDay() === 1;
                return show ? (
                  <div key={i} className="absolute bottom-1 text-center text-[10px] text-muted" style={{ left: i * dayW, width: zoom === "day" ? dayW : dayW * 7 }}>
                    {date.getUTCDate()}
                  </div>
                ) : null;
              })}
            </div>

            {/* Weekends and today */}
            {Array.from({ length: to - from + 1 }, (_, i) => {
              const dow = new Date((from + i) * DAY_MS).getUTCDay();
              return dow === 0 || dow === 6 ? (
                <div key={i} className="absolute bg-surface-2/60" style={{ left: i * dayW, width: dayW, top: HEADER, height }} />
              ) : null;
            })}
            <div className="absolute w-0.5 bg-ember" style={{ left: (today - from) * dayW + dayW / 2, top: HEADER - 6, height: height + 6 }} />

            {/* Milestones */}
            {milestones.map((m) => (
              <div
                key={m.id}
                title={m.name}
                className="absolute z-10 size-3 rotate-45 border-2 border-surface"
                style={{ left: (toDay(m.date) - from) * dayW + dayW / 2 - 6, top: HEADER - 9, background: m.done ? "var(--success)" : "var(--ember)" }}
              />
            ))}

            {/* Row lines */}
            {scheduled.map((t, i) => (
              <div key={t.id} className="absolute left-0 right-0 border-b border-line" style={{ top: HEADER + (i + 1) * ROW - 1 }} />
            ))}

            {/* Dependency arrows */}
            <svg className="pointer-events-none absolute left-0" style={{ top: HEADER }} width={width} height={height}>
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" />
                </marker>
              </defs>
              {deps.map((d) => {
                const a = tasks.find((t) => t.id === d.depends_on_id);
                const b = tasks.find((t) => t.id === d.task_id);
                if (!a || !b || !rowOf.has(a.id) || !rowOf.has(b.id)) return null;
                const sa = shownSpan(a);
                const sb = shownSpan(b);
                const x1 = (sa.end - from + 1) * dayW;
                const y1 = rowOf.get(a.id)! * ROW + ROW / 2;
                const x2 = (sb.start - from) * dayW;
                const y2 = rowOf.get(b.id)! * ROW + ROW / 2;
                const late = sb.start <= sa.end;
                const mid = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 16));
                return (
                  <path
                    key={d.task_id + d.depends_on_id}
                    d={`M${x1},${y1} H${mid} V${y2} H${x2}`}
                    fill="none"
                    stroke={late ? "var(--danger)" : "var(--muted)"}
                    strokeWidth="1.5"
                    markerEnd="url(#arrow)"
                  />
                );
              })}
            </svg>

            {/* Bars */}
            {scheduled.map((t, i) => {
              const s = shownSpan(t);
              const can = editableSet.has(t.id);
              return (
                <div
                  key={t.id}
                  title={`${t.title}: ${fromDay(s.start)} to ${fromDay(s.end)}`}
                  onPointerDown={(e) => onPointerDown(e, t, "move")}
                  className={cn(
                    "group absolute flex items-center rounded-md text-[11px] font-medium text-white shadow-card",
                    can ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                    t.done && "opacity-60",
                  )}
                  style={{ left: (s.start - from) * dayW + 1, width: (s.end - s.start + 1) * dayW - 2, top: HEADER + i * ROW + 7, height: ROW - 14, background: t.color }}
                >
                  {can && (
                    <span onPointerDown={(e) => onPointerDown(e, t, "start")} className="absolute left-0 h-full w-2 cursor-ew-resize rounded-l-md group-hover:bg-black/20" />
                  )}
                  <span className="truncate px-2">{zoom === "day" && s.end - s.start >= 2 ? t.title : ""}</span>
                  {can && (
                    <span onPointerDown={(e) => onPointerDown(e, t, "end")} className="absolute right-0 h-full w-2 cursor-ew-resize rounded-r-md group-hover:bg-black/20" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <p className="text-sm font-medium">Unscheduled ({unscheduled.length})</p>
          <p className="text-xs text-muted">Give these a start or due date to place them on the timeline.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unscheduled.map((t) => (
              <Link key={t.id} href={`${baseHref}/tasks/${t.number}`} className="rounded-md bg-surface-2 px-2 py-1 text-xs hover:text-brand">
                {projectKey}-{t.number} {t.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
