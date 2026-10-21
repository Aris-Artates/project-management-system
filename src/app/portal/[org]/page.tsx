import Link from "next/link";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { Card, Dot, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function PortalHome({ params }: PageProps<"/portal/[org]">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("projects")
    .select("id, key, name, description, color, end_date, status, tasks(completed_at)")
    .eq("org_id", ctx.org.id)
    .neq("status", "archived")
    .order("name");
  const projects = (data ?? []) as {
    id: string;
    key: string;
    name: string;
    description: string | null;
    color: string;
    end_date: string | null;
    tasks: { completed_at: string | null }[];
  }[];

  return (
    <div>
      <PageHeader title={`Welcome, ${displayName(ctx.profile).split(" ")[0]}`} description="Here is where your projects stand." />
      {projects.length === 0 ? (
        <EmptyState title="No projects shared with you yet" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const done = p.tasks.filter((t) => t.completed_at).length;
            const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
            return (
              <Link key={p.id} href={`/portal/${slug}/${p.key}`}>
                <Card className="h-full p-5 hover:border-brand">
                  <div className="flex items-center gap-2">
                    <Dot color={p.color} />
                    <h2 className="font-semibold">{p.name}</h2>
                  </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>{pct}% complete</span>
                    {p.end_date && <span>Target {formatDate(p.end_date)}</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
