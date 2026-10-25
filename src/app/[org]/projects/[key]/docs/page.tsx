import { redirect } from "next/navigation";
import { getProjectContext } from "@/lib/session";
import { getDocs } from "@/lib/queries";
import { EmptyState } from "@/components/ui";

export default async function DocsIndex({ params }: PageProps<"/[org]/projects/[key]/docs">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const docs = await getDocs(ctx.project.id);
  const first = docs.find((d) => !d.parent_id) ?? docs[0];
  if (first) redirect(`/${slug}/projects/${ctx.project.key}/docs/${first.id}`);
  return (
    <EmptyState title="No pages yet">
      {ctx.canProject("doc.edit") ? "Add the first page on the left: a brief, meeting notes, a how-to." : "Pages your team writes will show up here."}
    </EmptyState>
  );
}
