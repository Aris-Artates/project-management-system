import Link from "next/link";
import type { Metadata } from "next";
import { getOrgContext, getSupabase } from "@/lib/session";
import { Card, CardHeader, Dot, EmptyState, Input, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ params, searchParams }: PageProps<"/[org]/search">) {
  const { org: slug } = await params;
  const { q } = await searchParams;
  const ctx = await getOrgContext(slug);
  const term = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const supabase = await getSupabase();

  let projects: { key: string; name: string; color: string }[] = [];
  let tasks: { number: number; title: string; project: { key: string; color: string } }[] = [];
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const keyMatch = /^([A-Za-z][A-Za-z0-9]{1,5})-(\d+)$/.exec(term);
    const [p, t, k] = await Promise.all([
      supabase.from("projects").select("key, name, color").eq("org_id", ctx.org.id).ilike("name", like).limit(10),
      supabase
        .from("tasks")
        .select("number, title, project:projects!inner(key, color)")
        .eq("org_id", ctx.org.id)
        .ilike("title", like)
        .order("updated_at", { ascending: false })
        .limit(30),
      keyMatch
        ? supabase
            .from("tasks")
            .select("number, title, project:projects!inner(key, color)")
            .eq("org_id", ctx.org.id)
            .eq("number", Number(keyMatch[2]))
            .eq("project.key", keyMatch[1]!.toUpperCase())
        : Promise.resolve({ data: [] }),
    ]);
    projects = p.data ?? [];
    tasks = [...((k.data ?? []) as unknown as typeof tasks), ...((t.data ?? []) as unknown as typeof tasks)].filter(
      (x, i, all) => all.findIndex((y) => y.project.key === x.project.key && y.number === x.number) === i,
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" />
      <form className="mb-6">
        <Input name="q" defaultValue={term} placeholder="Task title, project name or a key like WEB-12" autoFocus />
      </form>
      {term && projects.length === 0 && tasks.length === 0 && <EmptyState title={`Nothing found for "${term}"`} />}
      {projects.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Projects" />
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.key}>
                <Link href={`/${slug}/projects/${p.key}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                  <Dot color={p.color} /> {p.name} <span className="font-mono text-xs text-muted">{p.key}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tasks.length > 0 && (
        <Card>
          <CardHeader title="Tasks" />
          <ul className="divide-y divide-line">
            {tasks.map((t) => (
              <li key={`${t.project.key}-${t.number}`}>
                <Link href={`/${slug}/projects/${t.project.key}/tasks/${t.number}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                  <Dot color={t.project.color} />
                  <span className="font-mono text-xs text-muted">
                    {t.project.key}-{t.number}
                  </span>
                  <span className="truncate">{t.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
