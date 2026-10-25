import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { getEvent } from "@/lib/queries";
import { deleteEvent, removeAttendee, respondToEvent } from "@/lib/actions/events";
import { EventForm } from "@/components/event-form";
import { ConfirmButton } from "@/components/form";
import { LocalTime } from "@/components/local-time";
import { Avatar, Badge, Button, Card, CardHeader, Dot } from "@/components/ui";
import type { Tone } from "@/components/ui";

const RESPONSE: Record<string, { label: string; tone: Tone }> = {
  yes: { label: "Going", tone: "success" },
  maybe: { label: "Maybe", tone: "warning" },
  no: { label: "Not going", tone: "danger" },
  pending: { label: "No reply", tone: "neutral" },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  return { title: event?.title ?? "Event" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/[org]/events/[id]">) {
  const { org: slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getOrgContext(slug);
  const event = await getEvent(id);
  if (!event || event.org_id !== ctx.org.id) notFound();

  const supabase = await getSupabase();
  const { data: canManage } = await supabase.rpc("can_manage_event", { _event: event.id });
  const me = event.attendees.find((a) => a.user_id === ctx.profile.id);
  const editing = !!canManage && sp.edit === "1";
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  let people: { id: string; name: string }[] = [];
  if (editing) {
    const { data } = event.project_id
      ? await supabase.from("project_members").select("user_id, profile:profiles!project_members_user_id_fkey(full_name, email)").eq("project_id", event.project_id)
      : await supabase.from("org_members").select("user_id, profile:profiles!org_members_user_id_fkey(full_name, email)").eq("org_id", ctx.org.id).eq("status", "active");
    people = ((data ?? []) as unknown as { user_id: string; profile: { full_name: string | null; email: string } }[]).map((p) => ({
      id: p.user_id,
      name: displayName(p.profile),
    }));
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Link href={`/${slug}/calendar`} className="text-sm text-muted hover:text-fg">
          Calendar
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {event.all_day ? (
              <>
                <LocalTime iso={event.starts_at} mode="date" /> (all day)
              </>
            ) : (
              <>
                <LocalTime iso={event.starts_at} /> to <LocalTime iso={event.ends_at} mode="time" />
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {event.project ? (
              <Link href={`/${slug}/projects/${event.project.key}`} className="flex items-center gap-1.5 hover:text-brand">
                <Dot color={event.project.color} /> {event.project.name}
              </Link>
            ) : (
              <Badge>Whole organization</Badge>
            )}
            {event.client_visible && <Badge tone="ember">Shown to clients</Badge>}
          </div>
        </div>

        {editing ? (
          <Card className="p-4">
            <EventForm
              orgId={ctx.org.id}
              orgSlug={slug}
              projects={[]}
              people={people}
              event={{ ...event, attendees: event.attendees.map((a) => a.user_id) }}
            />
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4 text-sm">
            {event.location && (
              <p>
                <span className="text-muted">Where: </span>
                {/^https?:\/\//.test(event.location) ? (
                  <a href={event.location} target="_blank" rel="noreferrer noopener" className="text-brand underline">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </p>
            )}
            <p className="whitespace-pre-wrap">{event.description || <span className="text-muted">No details.</span>}</p>
          </Card>
        )}

        {me && (
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-sm">Going?</span>
            {(["yes", "maybe", "no"] as const).map((r) => (
              <form key={r} action={respondToEvent}>
                {h("org_slug", slug)}
                {h("event_id", event.id)}
                {h("response", r)}
                <Button size="sm" variant={me.response === r ? "primary" : "secondary"}>
                  {RESPONSE[r]!.label}
                </Button>
              </form>
            ))}
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader title={`Attendees (${event.attendees.length})`} />
          <ul className="divide-y divide-line">
            {event.attendees.map((a) => (
              <li key={a.user_id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Avatar name={displayName(a.profile)} src={a.profile?.avatar_url} size={24} />
                <span className="min-w-0 flex-1 truncate">{displayName(a.profile)}</span>
                <Badge tone={RESPONSE[a.response]!.tone}>{RESPONSE[a.response]!.label}</Badge>
                {canManage && a.user_id !== ctx.profile.id && (
                  <form action={removeAttendee}>
                    {h("org_slug", slug)}
                    {h("event_id", event.id)}
                    {h("user_id", a.user_id)}
                    <button className="text-xs text-muted hover:text-danger" aria-label="Remove attendee">
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {canManage && (
          <Card className="flex flex-col gap-2 p-4">
            <Link href={editing ? `/${slug}/events/${event.id}` : `/${slug}/events/${event.id}?edit=1`} className="text-sm text-brand">
              {editing ? "Cancel editing" : "Edit event"}
            </Link>
            <form action={deleteEvent}>
              {h("org_slug", slug)}
              {h("event_id", event.id)}
              <ConfirmButton message="Delete this event?" variant="ghost">
                Delete event
              </ConfirmButton>
            </form>
          </Card>
        )}
      </aside>
    </div>
  );
}
