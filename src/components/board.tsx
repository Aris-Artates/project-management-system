"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveTask } from "@/lib/actions/tasks";
import { cn, formatDate, isOverdue, initials, PRIORITY_STYLE } from "@/lib/utils";

export type BoardTask = {
  id: string;
  number: number;
  title: string;
  status_id: string | null;
  position: number;
  priority: string;
  due_date: string | null;
  done: boolean;
  client_visible: boolean;
  assignees: string[];
};

export type BoardColumn = { id: string; name: string; color: string };

export function Board({
  columns,
  initialTasks,
  projectKey,
  baseHref,
  orgSlug,
  movable,
}: {
  columns: BoardColumn[];
  initialTasks: BoardTask[];
  projectKey: string;
  baseHref: string;
  orgSlug: string;
  movable: string[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  // Take fresh server data after a refresh (new tasks, other people's moves).
  const [seen, setSeen] = useState(initialTasks);
  if (seen !== initialTasks) {
    setSeen(initialTasks);
    setTasks(initialTasks);
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>(columns.map((c) => [c.id, []]));
    for (const t of tasks) map.get(t.status_id ?? columns[0]!.id)?.push(t);
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [tasks, columns]);

  const columnOf = (id: string) => (columns.some((c) => c.id === id) ? id : tasks.find((t) => t.id === id)?.status_id ?? null);

  const onStart = (e: DragStartEvent) => {
    setError(null);
    setActiveId(String(e.active.id));
  };

  // Move across columns while hovering so the card shows where it will land.
  const onOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const to = columnOf(String(e.over.id));
    const id = String(e.active.id);
    setTasks((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t || !to || t.status_id === to) return prev;
      return prev.map((x) => (x.id === id ? { ...x, status_id: to } : x));
    });
  };

  const onEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    if (!e.over) return;
    const to = columnOf(String(e.over.id));
    if (!to) return;

    const column = (byColumn.get(to) ?? []).filter((t) => t.id !== id);
    const overIndex = column.findIndex((t) => t.id === String(e.over!.id));
    const index = overIndex === -1 ? column.length : overIndex;
    const before = column[index - 1]?.position;
    const after = column[index]?.position;
    const position =
      before === undefined && after === undefined
        ? 1
        : before === undefined
          ? after! - 1
          : after === undefined
            ? before + 1
            : (before + after) / 2;

    const original = initialTasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status_id: to, position } : t)));
    startTransition(async () => {
      const err = await moveTask(id, to, position, orgSlug);
      if (err) {
        setError(err);
        if (original) setTasks((prev) => prev.map((t) => (t.id === id ? original : t)));
      }
    });
  };

  const active = tasks.find((t) => t.id === activeId);

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((c) => (
            <Column key={c.id} column={c} tasks={byColumn.get(c.id) ?? []}>
              {(byColumn.get(c.id) ?? []).map((t) => (
                <SortableCard
                  key={t.id}
                  task={t}
                  projectKey={projectKey}
                  href={`${baseHref}/tasks/${t.number}`}
                  disabled={!movable.includes(t.id)}
                />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <Card task={active} projectKey={projectKey} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ column, tasks, children }: { column: BoardColumn; tasks: BoardTask[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-[var(--radius-card)] bg-surface-2/70">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="size-2.5 rounded-full" style={{ background: column.color }} />
        <span className="text-sm font-semibold">{column.name}</span>
        <span className="text-xs text-muted">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3", isOver && "rounded-b-[var(--radius-card)] bg-brand-soft/50")}>
          {children}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ task, projectKey, href, disabled }: { task: BoardTask; projectKey: string; href: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <Card task={task} projectKey={projectKey} href={href} />
    </div>
  );
}

function Card({ task, projectKey, href, dragging }: { task: BoardTask; projectKey: string; href?: string; dragging?: boolean }) {
  const late = isOverdue(task.due_date, task.done);
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-3 shadow-card", dragging && "rotate-1 shadow-lg")}>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-mono">
          {projectKey}-{task.number}
        </span>
        {task.priority !== "none" && <span className={cn("capitalize font-medium", PRIORITY_STYLE[task.priority])}>{task.priority}</span>}
        {task.client_visible && <span className="ml-auto text-ember">Client</span>}
      </div>
      {href ? (
        <Link href={href} className={cn("mt-1 block text-sm font-medium hover:text-brand", task.done && "text-muted line-through")}>
          {task.title}
        </Link>
      ) : (
        <p className="mt-1 text-sm font-medium">{task.title}</p>
      )}
      {(task.due_date || task.assignees.length > 0) && (
        <div className="mt-2 flex items-center justify-between">
          <span className={cn("text-xs", late ? "font-medium text-danger" : "text-muted")}>{task.due_date ? formatDate(task.due_date) : ""}</span>
          <span className="flex -space-x-1.5">
            {task.assignees.slice(0, 3).map((name) => (
              <span
                key={name}
                title={name}
                className="flex size-5 items-center justify-center rounded-full bg-brand-soft text-[9px] font-semibold text-brand ring-2 ring-surface"
              >
                {initials(name)}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
