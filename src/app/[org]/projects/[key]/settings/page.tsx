import { getProjectContext, getSupabase, displayName } from "@/lib/session";
import { getCustomFields, getProjectMembers, getProjectWork } from "@/lib/queries";
import { saveProjectBilling } from "@/lib/actions/invoices";
import {
  addList,
  addMilestone,
  addProjectMember,
  addCustomField,
  addStatus,
  addTag,
  deleteCustomField,
  saveAsTemplate,
  deleteList,
  deleteMilestone,
  deleteProject,
  deleteStatus,
  deleteTag,
  removeProjectMember,
  setProjectRoleOverride,
  toggleMilestone,
  updateProject,
} from "@/lib/actions/projects";
import { ActionForm, AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, Dot, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { DueLabel } from "@/components/project-bits";
import type { Role } from "@/lib/types";

export default async function ProjectSettings({ params }: PageProps<"/[org]/projects/[key]/settings">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const p = ctx.project;
  const supabase = await getSupabase();
  const [{ statuses, lists, tags, milestones }, members, { data: orgMembers }, { data: roles }, fields] = await Promise.all([
    getProjectWork(p.id),
    getProjectMembers(p.id, ctx.org.id),
    supabase
      .from("org_members")
      .select("user_id, role:roles(name, system_key), profile:profiles!org_members_user_id_fkey(id, full_name, email)")
      .eq("org_id", ctx.org.id)
      .eq("status", "active"),
    supabase.from("roles").select("*").eq("org_id", ctx.org.id).is("system_key", null).order("position"),
    getCustomFields(p.id),
  ]);

  const canEdit = ctx.canProject("project.edit");
  const canMembers = ctx.canProject("project.manage_members");
  const canMilestones = ctx.canProject("milestone.manage");
  const customRoles = (roles ?? []) as Role[];
  const available = ((orgMembers ?? []) as unknown as {
    user_id: string;
    role: { name: string; system_key: string | null };
    profile: { id: string; full_name: string | null; email: string };
  }[]).filter((m) => !members.some((pm) => pm.user_id === m.user_id));
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const common = (
    <>
      {h("org_slug", slug)}
      {h("project_id", p.id)}
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {canEdit && (
        <Card className="lg:col-span-2">
          <CardHeader title="Project details" />
          <ActionForm action={updateProject} className="grid gap-4 p-4 sm:grid-cols-2">
            {common}
            {h("old_key", p.key)}
            <Field label="Name">
              <Input name="name" defaultValue={p.name} required />
            </Field>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
              <Field label="Key">
                <Input name="key" defaultValue={p.key} required maxLength={6} className="uppercase" />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={p.status}>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <Field label="Color">
                <Input name="color" type="color" defaultValue={p.color} className="w-14 p-1" />
              </Field>
            </div>
            <Field label="Description" className="sm:col-span-2">
              <Textarea name="description" defaultValue={p.description ?? ""} rows={3} />
            </Field>
            <Field label="Start">
              <Input name="start_date" type="date" defaultValue={p.start_date ?? ""} />
            </Field>
            <Field label="Due">
              <Input name="end_date" type="date" defaultValue={p.end_date ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Save project</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      <Card className="lg:col-span-2">
        <CardHeader
          title={`Members (${members.length})`}
          description="Org Admins and roles with View all projects can open this project without being listed. A project role replaces the person's org role inside this project."
        />
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const client = m.orgRole?.system_key === "client";
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={displayName(m.profile)} src={m.profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayName(m.profile)}</p>
                  <p className="truncate text-xs text-muted">{m.profile.email}</p>
                </div>
                <Badge tone={client ? "ember" : "neutral"}>{m.orgRole?.name ?? "Member"}</Badge>
                {canMembers && !client && m.orgRole?.system_key == null && customRoles.length > 0 && (
                  <form action={setProjectRoleOverride}>
                    {common}
                    {h("user_id", m.user_id)}
                    <AutoSubmitSelect
                      name="role_override_id"
                      defaultValue={m.role_override_id ?? ""}
                      className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs"
                    >
                      <option value="">Same as org role</option>
                      {customRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} here
                        </option>
                      ))}
                    </AutoSubmitSelect>
                  </form>
                )}
                {canMembers && m.user_id !== ctx.profile.id && (
                  <form action={removeProjectMember}>
                    {common}
                    {h("user_id", m.user_id)}
                    <ConfirmButton message={`Remove ${displayName(m.profile)} from this project?`} variant="ghost">
                      Remove
                    </ConfirmButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {canMembers && (
          <ActionForm action={addProjectMember} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
            {common}
            {h("org_id", ctx.org.id)}
            <Field label="Add from organization" className="min-w-56 flex-1">
              <Select name="user_id" defaultValue="" required>
                <option value="">Choose a person or client</option>
                {available.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile.full_name ?? m.profile.email} ({m.role.name})
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton>Add to project</SubmitButton>
            {available.length === 0 && (
              <p className="w-full text-xs text-muted">Everyone in the organization is already here. Invite new people from Members.</p>
            )}
          </ActionForm>
        )}
      </Card>

      {canMilestones && (
        <Card>
          <CardHeader title="Milestones" />
          <ul className="divide-y divide-line">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                {!m.client_visible && <Badge>Internal</Badge>}
                <DueLabel due={m.due_date} done={m.status === "done"} />
                <form action={toggleMilestone}>
                  {h("org_slug", slug)}
                  {h("id", m.id)}
                  {h("status", m.status)}
                  <button className="text-xs text-brand">{m.status === "done" ? "Reopen" : "Mark done"}</button>
                </form>
                <form action={deleteMilestone}>
                  {h("org_slug", slug)}
                  {h("id", m.id)}
                  <button className="text-xs text-muted hover:text-danger">Delete</button>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={addMilestone} resetOnSuccess showOk={false} className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            {common}
            <Input name="name" placeholder="Milestone name" required className="min-w-40 flex-1" />
            <Input name="due_date" type="date" className="w-auto" aria-label="Due date" />
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" name="client_visible" defaultChecked /> Client
            </label>
            <SubmitButton size="sm">Add</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {canEdit && (
        <>
          <Card>
            <CardHeader title="Statuses" description="Columns on the board, in order." />
            <ul className="divide-y divide-line">
              {statuses.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-2">
                  <Dot color={s.color} />
                  <span className="flex-1 text-sm">{s.name}</span>
                  <Badge>{s.category.replace("_", " ")}</Badge>
                  {statuses.length > 1 && (
                    <form action={deleteStatus}>
                      {h("org_slug", slug)}
                      {h("id", s.id)}
                      <ConfirmButton message="Delete this status? Tasks in it will have no status." variant="ghost">
                        Delete
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm action={addStatus} resetOnSuccess showOk={false} className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              {common}
              {h("position", String(statuses.length))}
              <Input name="name" placeholder="New status" required className="min-w-32 flex-1" />
              <Select name="category" defaultValue="in_progress" className="w-auto">
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </Select>
              <Input name="color" type="color" defaultValue="#64748b" className="w-12 p-1" />
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Task lists" />
            <ul className="divide-y divide-line">
              {lists.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1 text-sm">{l.name}</span>
                  <form action={deleteList}>
                    {h("org_slug", slug)}
                    {h("id", l.id)}
                    <ConfirmButton message="Delete this list? Its tasks stay, without a list." variant="ghost">
                      Delete
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
            <ActionForm action={addList} resetOnSuccess showOk={false} className="flex gap-2 border-t border-line p-3">
              {common}
              {h("position", String(lists.length))}
              <Input name="name" placeholder="New list" required />
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Tags" />
            <div className="flex flex-wrap gap-2 p-4">
              {tags.length === 0 && <span className="text-sm text-muted">No tags yet.</span>}
              {tags.map((t) => (
                <form key={t.id} action={deleteTag} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium" style={{ background: t.color + "22", color: t.color }}>
                  {h("org_slug", slug)}
                  {h("id", t.id)}
                  {t.name}
                  <button aria-label={`Delete tag ${t.name}`} className="opacity-60 hover:opacity-100">
                    ×
                  </button>
                </form>
              ))}
            </div>
            <ActionForm action={addTag} resetOnSuccess showOk={false} className="flex gap-2 border-t border-line p-3">
              {common}
              <Input name="name" placeholder="New tag" required maxLength={30} />
              <Input name="color" type="color" defaultValue="#0ea5e9" className="w-12 p-1" />
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          </Card>
        </>
      )}

      {ctx.can("invoice.manage") && (
        <Card className="lg:col-span-2">
          <CardHeader title="Billing and budget" description={`Amounts in ${ctx.org.currency}.`} />
          <ActionForm action={saveProjectBilling} className="grid gap-4 p-4 sm:grid-cols-3">
            {common}
            <Field label="Billing">
              <Select name="billing_type" defaultValue={p.billing_type ?? "hourly"}>
                <option value="hourly">Hourly (time and materials)</option>
                <option value="fixed">Fixed fee</option>
                <option value="none">Not billed</option>
              </Select>
            </Field>
            <Field label="Default hourly rate" hint="Personal rates take priority">
              <Input name="hourly_rate" type="number" min={0} step={0.01} defaultValue={p.hourly_rate ?? ""} />
            </Field>
            <div />
            <Field label="Budget amount">
              <Input name="budget_amount" type="number" min={0} step={0.01} defaultValue={p.budget_amount ?? ""} />
            </Field>
            <Field label="Budget hours">
              <Input name="budget_hours" type="number" min={0} step={0.5} defaultValue={p.budget_hours ?? ""} />
            </Field>
            <div />
            <Field label="Client name" hint="Used on invoices">
              <Input name="client_name" defaultValue={p.client_name ?? ""} maxLength={200} />
            </Field>
            <Field label="Client billing email">
              <Input name="client_email" type="email" defaultValue={p.client_email ?? ""} />
            </Field>
            <div className="sm:col-span-3">
              <SubmitButton size="sm">Save billing</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader title="Custom fields" description="Extra details on every task. Hidden from clients." />
          <ul className="divide-y divide-line">
            {fields.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 text-sm">{f.name}</span>
                <Badge>{f.field_type}</Badge>
                {f.options.length > 0 && <span className="max-w-40 truncate text-xs text-muted">{f.options.join(", ")}</span>}
                <form action={deleteCustomField}>
                  {h("org_slug", slug)}
                  {h("id", f.id)}
                  <ConfirmButton message={`Delete the ${f.name} field and its values?`} variant="ghost">
                    Delete
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={addCustomField} resetOnSuccess showOk={false} className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            {common}
            {h("position", String(fields.length))}
            <Input name="name" placeholder="Field name" required maxLength={40} className="min-w-32 flex-1" />
            <Select name="field_type" defaultValue="text" className="w-auto">
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="select">Dropdown</option>
              <option value="checkbox">Checkbox</option>
            </Select>
            <Input name="options" placeholder="Dropdown options, comma separated" className="min-w-48 flex-1" />
            <SubmitButton size="sm">Add</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {ctx.can("template.manage") && (
        <Card>
          <CardHeader title="Save as template" description="Reuse this project's statuses, lists, tags, milestones and tasks." />
          <ActionForm action={saveAsTemplate} resetOnSuccess className="flex flex-col gap-3 p-4">
            {common}
            <Field label="Template name">
              <Input name="name" defaultValue={`${p.name} template`} required maxLength={80} />
            </Field>
            <Field label="Description">
              <Input name="description" maxLength={200} />
            </Field>
            <div>
              <SubmitButton size="sm">Save template</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      {ctx.canProject("project.delete") && (
        <Card className="lg:col-span-2 border-danger/40">
          <CardHeader title="Delete project" />
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Notice tone="danger">This permanently deletes the project, its tasks, comments and file records.</Notice>
            <form action={deleteProject} className="ml-auto">
              {common}
              <ConfirmButton message={`Delete ${p.name} permanently?`} size="md">
                Delete project
              </ConfirmButton>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
