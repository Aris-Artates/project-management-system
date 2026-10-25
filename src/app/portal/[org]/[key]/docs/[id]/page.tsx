import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectContext } from "@/lib/session";
import { getDoc, getDocs } from "@/lib/queries";
import { DocTree } from "@/components/doc-tree";
import { Markdown } from "@/components/markdown";
import { Card } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default async function PortalDoc({ params }: PageProps<"/portal/[org]/[key]/docs/[id]">) {
  const { org: slug, key, id } = await params;
  const ctx = await getProjectContext(slug, key);
  const [doc, docs] = await Promise.all([getDoc(id), getDocs(ctx.project.id)]);
  if (!doc || doc.project_id !== ctx.project.id) notFound();
  const base = `/portal/${slug}/${ctx.project.key}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="text-sm text-muted hover:text-fg">
        {ctx.project.name}
      </Link>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <Card className="self-start p-2">
          <DocTree docs={docs} base={`${base}/docs`} activeId={doc.id} showVisibility={false} />
        </Card>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-sm text-muted">Updated {timeAgo(doc.updated_at)}</p>
          <Card className="mt-4 p-5">{doc.body.trim() ? <Markdown>{doc.body}</Markdown> : <p className="text-sm text-muted">This page is empty.</p>}</Card>
        </div>
      </div>
    </div>
  );
}
