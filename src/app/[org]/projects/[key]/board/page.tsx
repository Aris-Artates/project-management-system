import { getProjectContext, displayName } from "@/lib/session";
import { getProjectMembers, getProjectWork } from "@/lib/queries";
import { Board } from "@/components/board";
import { NewTaskForm } from "@/components/new-task-form";
import { Card } from "@/components/ui";

export default async function BoardPage({ params }: PageProps<"/[org]/projects/[key]/board">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const [{ tasks, statuses, lists, milestones }, members] = await Promise.all([
    getProjectWork(ctx.project.id),
    getProjectMembers(ctx.project.id, ctx.org.id),
  ]);
  const top = tasks.filter((t) => !t.parent_id);

  // Mirrors can_edit_task in the database; the database still has the final say.
  const editAll = ctx.canProject("task.edit");
  const editOwn = ctx.canProject("task.edit_own");
  const movable = top
    .filter(
      (t) =>
        editAll ||
        (editOwn && (t.created_by === ctx.profile.id || t.assignees.some((a) => a.user_id === ctx.profile.id))),
    )
    .map((t) => t.id);

  return (
    <div className="flex flex-col gap-5">
      {ctx.canProject("task.create") && (
        <Card className="p-3">
          <NewTaskForm
            orgSlug={slug}
            projectId={ctx.project.id}
            lists={lists}
            statuses={statuses}
            members={members}
            milestones={milestones}
            canAssign={ctx.canProject("task.assign")}
          />
        </Card>
      )}
      <Board
        columns={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        initialTasks={top.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          status_id: t.status_id,
          position: t.position,
          priority: t.priority,
          due_date: t.due_date,
          done: !!t.completed_at,
          client_visible: t.client_visible,
          assignees: t.assignees.map((a) => displayName(a.profile)),
        }))}
        projectKey={ctx.project.key}
        baseHref={`/${slug}/projects/${ctx.project.key}`}
        orgSlug={slug}
        movable={movable}
      />
    </div>
  );
}
