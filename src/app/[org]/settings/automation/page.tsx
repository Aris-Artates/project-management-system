import { redirect } from "next/navigation";
import { getOrgContext, getSupabase, displayName, requireFeature } from "@/lib/session";
import { deleteAutomationRule, toggleAutomationRule } from "@/lib/actions/admin-org";
import { RuleBuilder } from "@/components/rule-builder";
import { ConfirmButton } from "@/components/form";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import type { AutomationRule } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const TRIGGER_LABEL: Record<string, string> = {
  "task.created": "When a task is created",
  "task.status_changed": "When a task changes status",
  "task.completed": "When a task is completed",
  "bug.created": "When a bug is reported",
  "bug.status_changed": "When a bug changes status",
};

export default async function AutomationPage({ params, searchParams }: PageProps<"/[org]/settings/automation">) {
  const { org: slug } = await params;
  const { edit } = await searchParams;
  const ctx = await getOrgContext(slug);
  requireFeature(ctx, "automation");
  if (!ctx.can("automation.manage")) redirect(`/${slug}/settings`);
  const supabase = await getSupabase();
  const [{ data: rules }, { data: projects }, { data: members }, { data: runs }] = await Promise.all([
    supabase.from("automation_rules").select("*").eq("org_id", ctx.org.id).order("created_at"),
    supabase
      .from("projects")
      .select("id, key, name, statuses:task_statuses(id, name, position), lists:task_lists(id, name, position)")
      .eq("org_id", ctx.org.id)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("org_members")
      .select("user_id, role:roles(system_key), profile:profiles!org_members_user_id_fkey(full_name, email)")
      .eq("org_id", ctx.org.id)
      .eq("status", "active"),
    supabase.from("automation_runs").select("rule_id, ok, message, created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(50),
  ]);

  const projectOpts = ((projects ?? []) as unknown as {
    id: string;
    key: string;
    name: string;
    statuses: { id: string; name: string; position: number }[];
    lists: { id: string; name: string; position: number }[];
  }[]).map((p) => ({
    id: p.id,
    label: `${p.key} ${p.name}`,
    statuses: [...p.statuses].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, label: s.name })),
    lists: [...p.lists].sort((a, b) => a.position - b.position).map((l) => ({ id: l.id, label: l.name })),
  }));
  const people = ((members ?? []) as unknown as { user_id: string; role: { system_key: string | null }; profile: { full_name: string | null; email: string } }[])
    .filter((m) => m.role.system_key !== "client")
    .map((m) => ({ id: m.user_id, label: displayName(m.profile) }));
  const list = (rules ?? []) as AutomationRule[];
  const editing = list.find((r) => r.id === edit);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Rules" description="Rules run instantly, inside the same change. Changes a rule makes do not trigger other rules." />
        {list.length === 0 ? (
          <p className="p-4 text-sm text-muted">No rules yet. Create one below.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const lastRun = (runs ?? []).find((x) => x.rule_id === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.name} {!r.enabled && <Badge tone="warning">Off</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {TRIGGER_LABEL[r.trigger]}
                      {r.project_id ? ` in ${projectOpts.find((p) => p.id === r.project_id)?.label ?? "a project"}` : ""} · {r.actions.length} action
                      {r.actions.length === 1 ? "" : "s"} · ran {r.run_count} time{r.run_count === 1 ? "" : "s"}
                      {r.last_run_at ? `, last ${timeAgo(r.last_run_at)}` : ""}
                    </p>
                    {lastRun && !lastRun.ok && <p className="text-xs text-danger">Last run failed: {lastRun.message}</p>}
                  </div>
                  <a href={`?edit=${r.id}`} className="text-xs text-brand">
                    Edit
                  </a>
                  <form action={toggleAutomationRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <input type="hidden" name="enabled" value={String(!r.enabled)} />
                    <Button size="sm" variant="ghost">
                      {r.enabled ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                  <form action={deleteAutomationRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <ConfirmButton message={`Delete the rule "${r.name}"?`} variant="ghost">
                      Delete
                    </ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={editing ? `Edit "${editing.name}"` : "New rule"} />
        <div className="p-4">
          <RuleBuilder
            key={editing?.id ?? "new"}
            orgId={ctx.org.id}
            orgSlug={slug}
            projects={projectOpts}
            people={people}
            rule={editing ? { id: editing.id, name: editing.name, trigger: editing.trigger, project_id: editing.project_id, conditions: editing.conditions, actions: editing.actions } : undefined}
          />
        </div>
      </Card>
    </div>
  );
}
