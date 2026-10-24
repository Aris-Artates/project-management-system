import { getProjectContext } from "@/lib/session";
import { getDependencies, getProjectWork } from "@/lib/queries";
import { Gantt } from "@/components/gantt";

export default async function GanttPage({ params }: PageProps<"/[org]/projects/[key]/gantt">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const [{ tasks, statuses, milestones }, deps] = await Promise.all([getProjectWork(ctx.project.id), getDependencies(ctx.project.id)]);
  const colorOf = new Map(statuses.map((s) => [s.id, s.color]));

  // Parents first, each followed by its subtasks.
  const ordered = tasks
    .filter((t) => !t.parent_id)
    .flatMap((t) => [{ t, depth: 0 }, ...tasks.filter((s) => s.parent_id === t.id).map((s) => ({ t: s, depth: 1 }))]);

  const editAll = ctx.canProject("task.edit");
  const editOwn = ctx.canProject("task.edit_own");
  const editable = tasks
    .filter((t) => editAll || (editOwn && (t.created_by === ctx.profile.id || t.assignees.some((a) => a.user_id === ctx.profile.id))))
    .map((t) => t.id);

  return (
    <Gantt
      tasks={ordered.map(({ t, depth }) => ({
        id: t.id,
        number: t.number,
        title: t.title,
        start: t.start_date,
        due: t.due_date,
        done: !!t.completed_at,
        color: colorOf.get(t.status_id ?? "") ?? "#64748b",
        depth,
      }))}
      milestones={milestones.filter((m) => m.due_date).map((m) => ({ id: m.id, name: m.name, date: m.due_date!, done: m.status === "done" }))}
      deps={deps}
      editable={editable}
      projectKey={ctx.project.key}
      baseHref={`/${slug}/projects/${ctx.project.key}`}
      orgSlug={slug}
    />
  );
}
