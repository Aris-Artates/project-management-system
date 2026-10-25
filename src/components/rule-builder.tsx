"use client";

import { useState } from "react";
import { saveAutomationRule } from "@/lib/actions/admin-org";
import { ActionForm, SubmitButton } from "./form";
import { Button, Field, Input, Select } from "./ui";

type Option = { id: string; label: string };
type ProjectOpt = { id: string; label: string; statuses: Option[]; lists: Option[] };
type Action = Record<string, string | boolean>;

const TRIGGERS: [string, string][] = [
  ["task.created", "A task is created"],
  ["task.status_changed", "A task changes status"],
  ["task.completed", "A task is completed"],
  ["bug.created", "A bug is reported"],
  ["bug.status_changed", "A bug changes status"],
];
const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
const BUG_STATUSES = ["new", "open", "in_progress", "fixed", "verified", "closed", "reopened"];
const SEVERITIES = ["minor", "major", "critical", "blocker"];

export type RuleInput = {
  id?: string;
  name: string;
  trigger: string;
  project_id: string | null;
  conditions: Record<string, string>;
  actions: Action[];
};

export function RuleBuilder({
  orgId,
  orgSlug,
  projects,
  people,
  rule,
}: {
  orgId: string;
  orgSlug: string;
  projects: ProjectOpt[];
  people: Option[];
  rule?: RuleInput;
}) {
  const [trigger, setTrigger] = useState(rule?.trigger ?? "task.created");
  const [projectId, setProjectId] = useState(rule?.project_id ?? "");
  const [conditions, setConditions] = useState<Record<string, string>>(rule?.conditions ?? {});
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? [{ type: trigger.startsWith("bug") ? "notify" : "assign" }]);
  const isBug = trigger.startsWith("bug");
  const project = projects.find((p) => p.id === projectId);

  const setCond = (k: string, v: string) =>
    setConditions((c) => {
      const next = { ...c };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  const setAction = (i: number, patch: Action) => setActions((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const actionTypes: [string, string][] = isBug
    ? [
        ["assign", "Assign to"],
        ["set_bug_status", "Set status"],
        ["comment", "Add a comment"],
        ["notify", "Notify"],
        ["share_with_client", "Share with client"],
      ]
    : [
        ["assign", "Assign to"],
        ["set_priority", "Set priority"],
        ...(project ? ([["set_status", "Set status"], ["move_to_list", "Move to list"]] as [string, string][]) : []),
        ["comment", "Add a comment"],
        ["notify", "Notify"],
        ["share_with_client", "Share with client"],
      ];

  // Keep only conditions that make sense for the chosen trigger and project.
  const cleanConditions = Object.fromEntries(
    Object.entries(conditions).filter(([k]) =>
      isBug ? ["severity", "bug_status"].includes(k) : ["priority", "status_category", ...(project ? ["status_id", "list_id"] : [])].includes(k),
    ),
  );

  return (
    <ActionForm action={saveAutomationRule} resetOnSuccess={!rule} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="org_slug" value={orgSlug} />
      {rule?.id && <input type="hidden" name="rule_id" value={rule.id} />}
      <input type="hidden" name="conditions" value={JSON.stringify(cleanConditions)} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Rule name">
          <Input name="name" defaultValue={rule?.name} required maxLength={120} placeholder="Urgent bugs to the lead" />
        </Field>
        <Field label="When">
          <Select name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {TRIGGERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="In">
          <Select name="project_id" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Any project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Only if (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {isBug ? (
            <>
              <Field label="Severity">
                <Select value={conditions.severity ?? ""} onChange={(e) => setCond("severity", e.target.value)}>
                  <option value="">Any</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              {trigger === "bug.status_changed" && (
                <Field label="New status">
                  <Select value={conditions.bug_status ?? ""} onChange={(e) => setCond("bug_status", e.target.value)}>
                    <option value="">Any</option>
                    {BUG_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Priority">
                <Select value={conditions.priority ?? ""} onChange={(e) => setCond("priority", e.target.value)}>
                  <option value="">Any</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              {project ? (
                <Field label="Status">
                  <Select value={conditions.status_id ?? ""} onChange={(e) => setCond("status_id", e.target.value)}>
                    <option value="">Any</option>
                    {project.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Status stage">
                  <Select value={conditions.status_category ?? ""} onChange={(e) => setCond("status_category", e.target.value)}>
                    <option value="">Any</option>
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </Select>
                </Field>
              )}
              {project && (
                <Field label="List">
                  <Select value={conditions.list_id ?? ""} onChange={(e) => setCond("list_id", e.target.value)}>
                    <option value="">Any</option>
                    {project.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-medium">Then</legend>
        <div className="flex flex-col gap-2">
          {actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={String(a.type)} onChange={(e) => setAction(i, { type: e.target.value })} className="h-9 w-auto">
                {actionTypes.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              {a.type === "assign" && (
                <Select value={String(a.user_id ?? "")} onChange={(e) => setAction(i, { user_id: e.target.value })} className="h-9 w-auto" required>
                  <option value="">Choose a person</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "set_priority" && (
                <Select value={String(a.priority ?? "high")} onChange={(e) => setAction(i, { priority: e.target.value })} className="h-9 w-auto">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "set_status" && project && (
                <Select value={String(a.status_id ?? "")} onChange={(e) => setAction(i, { status_id: e.target.value })} className="h-9 w-auto" required>
                  <option value="">Choose a status</option>
                  {project.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "move_to_list" && project && (
                <Select value={String(a.list_id ?? "")} onChange={(e) => setAction(i, { list_id: e.target.value })} className="h-9 w-auto" required>
                  <option value="">Choose a list</option>
                  {project.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "set_bug_status" && (
                <Select value={String(a.status ?? "open")} onChange={(e) => setAction(i, { status: e.target.value })} className="h-9 w-auto">
                  {BUG_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "comment" && (
                <>
                  <Input
                    value={String(a.body ?? "")}
                    onChange={(e) => setAction(i, { body: e.target.value })}
                    placeholder="Comment text"
                    className="h-9 min-w-56 flex-1"
                    maxLength={2000}
                    required
                  />
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="checkbox" checked={a.internal !== false} onChange={(e) => setAction(i, { internal: e.target.checked })} />
                    Internal
                  </label>
                </>
              )}
              {a.type === "notify" && (
                <>
                  <Select value={String(a.who ?? (isBug ? "reporter" : "assignees"))} onChange={(e) => setAction(i, { who: e.target.value })} className="h-9 w-auto">
                    {isBug ? <option value="reporter">The reporter</option> : <option value="creator">The creator</option>}
                    <option value="assignees">{isBug ? "The assignee" : "The assignees"}</option>
                    <option value="user">A specific person</option>
                  </Select>
                  {a.who === "user" && (
                    <Select value={String(a.user_id ?? "")} onChange={(e) => setAction(i, { user_id: e.target.value })} className="h-9 w-auto" required>
                      <option value="">Choose a person</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Input
                    value={String(a.message ?? "")}
                    onChange={(e) => setAction(i, { message: e.target.value })}
                    placeholder="Message (optional)"
                    className="h-9 min-w-48 flex-1"
                    maxLength={200}
                  />
                </>
              )}
              {actions.length > 1 && (
                <button type="button" onClick={() => setActions((x) => x.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-danger">
                  Remove
                </button>
              )}
            </div>
          ))}
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setActions((x) => [...x, { type: "comment" }])}>
              Add another action
            </Button>
          </div>
        </div>
      </fieldset>
      <div>
        <SubmitButton>{rule ? "Save rule" : "Create rule"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
