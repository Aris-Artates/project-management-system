import { getProjectContext } from "@/lib/session";
import { getDocs } from "@/lib/queries";
import { createDoc } from "@/lib/actions/docs";
import { ActionForm, SubmitButton } from "@/components/form";
import { DocTree } from "@/components/doc-tree";
import { Card, Input } from "@/components/ui";

export default async function DocsLayout({ children, params }: LayoutProps<"/[org]/projects/[key]/docs">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const docs = await getDocs(ctx.project.id);
  const base = `/${slug}/projects/${ctx.project.key}/docs`;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <Card className="self-start p-2">
        <p className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted">Pages</p>
        <DocTree docs={docs} base={base} />
        {ctx.canProject("doc.edit") && (
          <ActionForm action={createDoc} className="mt-2 flex gap-2 border-t border-line p-2">
            <input type="hidden" name="org_slug" value={slug} />
            <input type="hidden" name="project_id" value={ctx.project.id} />
            <input type="hidden" name="base" value={base} />
            <Input name="title" placeholder="New page title" required maxLength={200} className="h-8" />
            <SubmitButton size="sm">Add</SubmitButton>
          </ActionForm>
        )}
      </Card>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
