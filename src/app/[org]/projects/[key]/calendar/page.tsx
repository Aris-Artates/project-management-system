import { getProjectContext, displayName } from "@/lib/session";
import { getEvents, getProjectMembers, getProjectWork } from "@/lib/queries";
import { MonthCalendar } from "@/components/month-calendar";
import { EventForm } from "@/components/event-form";
import { Card, CardHeader } from "@/components/ui";
import { todayISO } from "@/lib/utils";

export default async function CalendarPage({ params, searchParams }: PageProps<"/[org]/projects/[key]/calendar">) {
  const { org: slug, key } = await params;
  const { m } = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : todayISO().slice(0, 7);
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const [{ tasks, statuses, milestones }, events, members] = await Promise.all([
    getProjectWork(ctx.project.id),
    getEvents({ projectId: ctx.project.id, from: new Date(Date.UTC(y, mo - 2, 20)).toISOString(), to: new Date(Date.UTC(y, mo, 12)).toISOString() }),
    getProjectMembers(ctx.project.id, ctx.org.id),
  ]);
  const base = `/${slug}/projects/${ctx.project.key}`;
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
      .map((ms) => ({ id: ms.id, date: ms.due_date!, label: `◆ ${ms.name}`, href: base, color: "#e2603a", done: ms.status === "done" })),
    ...events.map((e) => ({
      id: e.id,
      date: e.starts_at.slice(0, 10),
      label: `● ${e.title}`,
      href: `/${slug}/events/${e.id}`,
      color: "#17594f",
      done: false,
    })),
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <MonthCalendar month={month} items={items} hrefFor={(mm) => `${base}/calendar?m=${mm}`} />
      {ctx.canProject("event.manage") && (
        <Card className="self-start">
          <CardHeader title="New event" />
          <div className="p-4">
            <EventForm
              orgId={ctx.org.id}
              orgSlug={slug}
              projects={[{ id: ctx.project.id, label: `${ctx.project.key} ${ctx.project.name}` }]}
              defaultProjectId={ctx.project.id}
              people={members.map((m) => ({ id: m.user_id, name: displayName(m.profile) }))}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
