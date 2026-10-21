import Link from "next/link";
import type { Metadata } from "next";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { Card, CardHeader, Dot, EmptyState, PageHeader } from "@/components/ui";
import { DueLabel, PriorityLabel } from "@/components/project-bits";
import { isOverdue, isoInDays, todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "My work" };

type MyTask = {
  task: {
    id: string;
    number: number;
    title: string;
    due_date: string | null;
    priority: string;
    completed_at: string | null;
    status: { name: string; color: string } | null;
    project: { key: string; name: string; color: string; org_id: string };
  };
};

export default async function MyWork({ params }: PageProps<"/[org]">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();

  const { data } = await supabase
    .from("task_assignees")
    .select(
      "task:tasks!inner(id, number, title, due_date, priority, completed_at, status:task_statuses(name, color), project:projects!inner(key, name, color, org_id))",
    )
    .eq("user_id", ctx.profile.id)
    .eq("org_id", ctx.org.id)
    .is("task.completed_at", null);

  const tasks = ((data ?? []) as unknown as MyTask[]).map((r) => r.task);
  const today = todayISO();
  const week = isoInDays(7);
  const sections = [
    { title: "Overdue", tasks: tasks.filter((t) => isOverdue(t.due_date, false)) },
    { title: "Due today", tasks: tasks.filter((t) => t.due_date === today) },
    { title: "Next 7 days", tasks: tasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= week) },
    { title: "Later or no date", tasks: tasks.filter((t) => !t.due_date || t.due_date > week) },
  ];
  sections.forEach((s) => s.tasks.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Hello, ${displayName(ctx.profile).split(" ")[0]}`}
        description={tasks.length ? `You have ${tasks.length} open task${tasks.length === 1 ? "" : "s"} in ${ctx.org.name}.` : `Nothing assigned to you in ${ctx.org.name}.`}
      />
      {tasks.length === 0 ? (
        <EmptyState title="Your plate is clear">
          Open <Link href={`/${slug}/projects`} className="text-brand">Projects</Link> to pick something up.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((s) =>
            s.tasks.length ? (
              <Card key={s.title}>
                <CardHeader title={`${s.title} (${s.tasks.length})`} />
                <ul className="divide-y divide-line">
                  {s.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <Dot color={t.project.color} />
                      <span className="font-mono text-xs text-muted">
                        {t.project.key}-{t.number}
                      </span>
                      <Link href={`/${slug}/projects/${t.project.key}/tasks/${t.number}`} className="min-w-0 flex-1 truncate text-sm hover:text-brand">
                        {t.title}
                      </Link>
                      {t.status && (
                        <span className="flex items-center gap-1.5 text-xs">
                          <Dot color={t.status.color} className="size-2" />
                          {t.status.name}
                        </span>
                      )}
                      <PriorityLabel priority={t.priority} />
                      <DueLabel due={t.due_date} done={false} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
