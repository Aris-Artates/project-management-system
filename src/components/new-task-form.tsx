import { createTask } from "@/lib/actions/tasks";
import type { ProjectMember } from "@/lib/queries";
import type { Milestone, TaskList, TaskStatus } from "@/lib/types";
import { displayName } from "@/lib/session";
import { ActionForm, SubmitButton } from "./form";
import { Input, Select } from "./ui";

export function NewTaskForm({
  orgSlug,
  projectId,
  lists,
  statuses,
  members,
  milestones,
  canAssign,
  defaultListId,
  parentId,
  compact = false,
}: {
  orgSlug: string;
  projectId: string;
  lists: TaskList[];
  statuses: TaskStatus[];
  members: ProjectMember[];
  milestones: Milestone[];
  canAssign: boolean;
  defaultListId?: string;
  parentId?: string;
  compact?: boolean;
}) {
  const team = members.filter((m) => m.orgRole?.system_key !== "client");
  return (
    <ActionForm action={createTask} resetOnSuccess showOk={false} className="flex flex-col gap-2">
      <input type="hidden" name="org_slug" value={orgSlug} />
      <input type="hidden" name="project_id" value={projectId} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <div className="flex flex-wrap gap-2">
        <Input name="title" placeholder={parentId ? "Add a subtask" : "Add a task"} required className="min-w-48 flex-1" />
        {!compact && (
          <>
            {lists.length > 1 && (
              <Select name="list_id" defaultValue={defaultListId ?? lists[0]?.id} className="w-auto">
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
            {lists.length === 1 && <input type="hidden" name="list_id" value={lists[0]!.id} />}
            <Select name="status_id" defaultValue={statuses[0]?.id} className="w-auto">
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {canAssign && (
              <Select name="assignee_id" defaultValue="" className="w-auto">
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {displayName(m.profile)}
                  </option>
                ))}
              </Select>
            )}
            <Select name="priority" defaultValue="none" className="w-auto">
              <option value="none">No priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Input name="due_date" type="date" className="w-auto" aria-label="Due date" />
            {milestones.length > 0 && (
              <Select name="milestone_id" defaultValue="" className="w-auto">
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" name="client_visible" className="accent-[var(--brand)]" /> Client can see
            </label>
          </>
        )}
        {compact && defaultListId && <input type="hidden" name="list_id" value={defaultListId} />}
        <SubmitButton pendingText="Adding...">Add</SubmitButton>
      </div>
    </ActionForm>
  );
}
