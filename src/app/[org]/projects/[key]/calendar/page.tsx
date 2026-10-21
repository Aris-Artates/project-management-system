import { getProjectContext } from "@/lib/session";
import { getProjectWork } from "@/lib/queries";
import { MonthCalendar } from "@/components/month-calendar";
import { todayISO } from "@/lib/utils";

export default async function CalendarPage({ params, searchParams }: PageProps<"/[org]/projects/[key]/calendar">) {
  const { org: slug, key } = await params;
  const { m } = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const { tasks, statuses, milestones } = await getProjectWork(ctx.project.id);
  const base = `/${slug}/projects/${ctx.project.key}`;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : todayISO().slice(0, 7);
  const colorOf = new Map(statuses.map((s) => [s.id, s.color]));

  const items = [
    ...tasks
      .filter((t) => t.due_date)
      .map((t) => ({
        id: t.id,
        date: t.due_date!,
        label: `${ctx.project.key}-${t.number} ${t.title}`,
        href: `${base}/tasks/${t.number}`,
        color: colorOf.get(t.status_id ?? "") ?? "#64748b",
        done: !!t.completed_at,
      })),
    ...milestones
      .filter((ms) => ms.due_date)
      .map((ms) => ({
        id: ms.id,
        date: ms.due_date!,
        label: `◆ ${ms.name}`,
        href: base,
        color: "#e2603a",
        done: ms.status === "done",
      })),
  ];

  return <MonthCalendar month={month} items={items} hrefFor={(mm) => `${base}/calendar?m=${mm}`} />;
}
