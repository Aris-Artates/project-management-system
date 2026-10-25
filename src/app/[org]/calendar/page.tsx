import type { Metadata } from "next";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { getEvents } from "@/lib/queries";
import { MonthCalendar } from "@/components/month-calendar";
import { EventForm } from "@/components/event-form";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar" };

// Organization calendar: events you can see plus tasks assigned to you.
export default async function OrgCalendar({ params, searchParams }: PageProps<"/[org]/calendar">) {
  const { org: slug } = await params;
  const { m } = await searchParams;
  const ctx = await getOrgContext(slug);
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : todayISO().slice(0, 7);
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const from = new Date(Date.UTC(y, mo - 2, 20)).toISOString();
  const to = new Date(Date.UTC(y, mo, 12)).toISOString();

  const supabase = await getSupabase();
  const [events, { data: mine }, { data: projects }, { data: members }] = await Promise.all([
    getEvents({ orgId: ctx.org.id, from, to }),
    supabase
      .from("task_assignees")
      .select("task:tasks!inner(id, number, title, due_date, completed_at, project:projects!inner(key, color))")
      .eq("user_id", ctx.profile.id)
      .eq("org_id", ctx.org.id)
      .not("task.due_date", "is", null),
    supabase.from("projects").select("id, key, name").eq("org_id", ctx.org.id).neq("status", "archived").order("name"),
    supabase
      .from("org_members")
      .select("user_id, role:roles(system_key), profile:profiles!org_members_user_id_fkey(id, full_name, email)")
      .eq("org_id", ctx.org.id)
      .eq("status", "active"),
  ]);

  const tasks = ((mine ?? []) as unknown as {
    task: { id: string; number: number; title: string; due_date: string; completed_at: string | null; project: { key: string; color: string } };
  }[]).map((r) => r.task);

  const items = [
    ...events.flatMap((e) => {
      // Multi-day events appear on each day they cover.
      const days: string[] = [];
      const start = new Date(e.starts_at);
      const end = new Date(e.ends_at);
      for (let d = new Date(start); d <= end && days.length < 31; d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
      return days.map((date, i) => ({
        id: `${e.id}-${i}`,
        date,
        label: e.title,
        href: `/${slug}/events/${e.id}`,
        color: e.project?.color ?? "#17594f",
        done: false,
      }));
    }),
    ...tasks.map((t) => ({
      id: t.id,
      date: t.due_date,
      label: `${t.project.key}-${t.number} ${t.title}`,
      href: `/${slug}/projects/${t.project.key}/tasks/${t.number}`,
      color: "#64748b",
      done: !!t.completed_at,
    })),
  ];

  const canCreate = ctx.can("event.manage");
  const people = ((members ?? []) as unknown as { user_id: string; role: { system_key: string | null }; profile: { full_name: string | null; email: string } }[])
    .filter((p) => p.role.system_key !== "client")
    .map((p) => ({ id: p.user_id, name: displayName(p.profile) }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Calendar" description="Events you can see, plus tasks assigned to you (in grey)." />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <MonthCalendar month={month} items={items} hrefFor={(mm) => `/${slug}/calendar?m=${mm}`} />
        {canCreate && (
          <Card className="self-start">
            <CardHeader title="New event" />
            <div className="p-4">
              <EventForm
                orgId={ctx.org.id}
                orgSlug={slug}
                projects={(projects ?? []).map((p) => ({ id: p.id, label: `${p.key} ${p.name}` }))}
                people={people}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
