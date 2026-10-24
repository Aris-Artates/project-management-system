import Link from "next/link";
import type { Metadata } from "next";
import { getOrgContext, getSupabase } from "@/lib/session";
import { createProject, createProjectFromTemplate, deleteTemplate } from "@/lib/actions/projects";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Card, CardHeader, Dot, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import type { ProjectTemplate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS } from "@/components/project-bits";

export const metadata: Metadata = { title: "Projects" };

type Row = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  color: string;
  end_date: string | null;
  tasks: { completed_at: string | null }[];
};

export default async function ProjectsPage({ params, searchParams }: PageProps<"/[org]/projects">) {
  const { org: slug } = await params;
  const { show } = await searchParams;
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();

  let query = supabase
    .from("projects")
    .select("id, key, name, description, status, color, end_date, tasks(completed_at)")
    .eq("org_id", ctx.org.id)
    .order("name");
  if (show !== "archived") query = query.neq("status", "archived");
  const [{ data }, { data: templateRows }] = await Promise.all([
    query,
    supabase.from("project_templates").select("id, name, description, created_at").eq("org_id", ctx.org.id).order("name"),
  ]);
  const projects = (data ?? []) as Row[];
  const templates = (templateRows ?? []) as ProjectTemplate[];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projects"
        description={ctx.can("project.view_all") ? "Every project in the organization" : "Projects you are part of"}
        actions={
          <Link href={show === "archived" ? `/${slug}/projects` : `/${slug}/projects?show=archived`} className="text-sm text-muted hover:text-fg">
            {show === "archived" ? "Hide archived" : "Show archived"}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {projects.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState title="No projects yet">
                {ctx.can("project.create") ? "Create the first one on the right." : "Ask a project manager to add you."}
              </EmptyState>
            </div>
          )}
          {projects.map((p) => {
            const done = p.tasks.filter((t) => t.completed_at).length;
            const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
            const status = PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS];
            return (
              <Link key={p.id} href={`/${slug}/projects/${p.key}`}>
                <Card className="h-full p-4 transition-colors hover:border-brand">
                  <div className="flex items-center gap-2">
                    <Dot color={p.color} />
                    <span className="text-xs font-mono text-muted">{p.key}</span>
                    <Badge tone={status.tone} className="ml-auto">
                      {status.label}
                    </Badge>
                  </div>
                  <h2 className="mt-2 font-semibold">{p.name}</h2>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>
                      {done}/{p.tasks.length} tasks done
                    </span>
                    {p.end_date && <span>Due {formatDate(p.end_date)}</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {ctx.can("project.create") && (
          <div className="flex flex-col gap-6 self-start">
          {templates.length > 0 && (
            <Card>
              <CardHeader title="Start from a template" />
              <ActionForm action={createProjectFromTemplate} className="flex flex-col gap-3 p-4">
                <input type="hidden" name="org_slug" value={slug} />
                <Field label="Template">
                  <Select name="template_id" required>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Name">
                  <Input name="name" required maxLength={120} />
                </Field>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                  <Field label="Key">
                    <Input name="key" required maxLength={6} placeholder="NEW" className="uppercase" />
                  </Field>
                  <Field label="Start">
                    <Input name="start_date" type="date" />
                  </Field>
                  <Field label="Color">
                    <Input name="color" type="color" defaultValue="#4f46e5" className="w-14 p-1" />
                  </Field>
                </div>
                <SubmitButton pendingText="Creating...">Create from template</SubmitButton>
              </ActionForm>
              {ctx.can("template.manage") && (
                <ul className="divide-y divide-line border-t border-line">
                  {templates.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <form action={deleteTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <button className="text-xs text-muted hover:text-danger">Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="New project" />
            <ActionForm action={createProject} className="flex flex-col gap-3 p-4">
              <input type="hidden" name="org_id" value={ctx.org.id} />
              <input type="hidden" name="org_slug" value={slug} />
              <Field label="Name">
                <Input name="name" required maxLength={120} />
              </Field>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Key" hint="Used in task IDs, like WEB-12">
                  <Input name="key" required maxLength={6} placeholder="WEB" className="uppercase" />
                </Field>
                <Field label="Color">
                  <Input name="color" type="color" defaultValue="#4f46e5" className="w-14 p-1" />
                </Field>
              </div>
              <Field label="Description">
                <Textarea name="description" rows={3} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start">
                  <Input name="start_date" type="date" />
                </Field>
                <Field label="Due">
                  <Input name="end_date" type="date" />
                </Field>
              </div>
              <SubmitButton pendingText="Creating...">Create project</SubmitButton>
            </ActionForm>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
