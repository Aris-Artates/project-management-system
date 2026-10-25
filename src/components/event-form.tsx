"use client";

import { useState, useSyncExternalStore } from "react";
import { saveEvent } from "@/lib/actions/events";
import { ActionForm, SubmitButton } from "./form";
import { Field, Input, Select, Textarea } from "./ui";

type Person = { id: string; name: string };

function toLocalInput(iso: string | undefined, allDay: boolean) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return allDay ? local.slice(0, 10) : local.slice(0, 16);
}

const noop = () => () => {};

// Create or edit an event. Times are entered in the viewer's own timezone.
export function EventForm({
  orgId,
  orgSlug,
  projects,
  defaultProjectId,
  people,
  event,
}: {
  orgId: string;
  orgSlug: string;
  projects: { id: string; label: string }[];
  defaultProjectId?: string;
  people: Person[];
  event?: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    client_visible: boolean;
    project_id: string | null;
    attendees: string[];
  };
}) {
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  // Offset is only known in the browser; the server render uses 0 and hydration fills it in.
  const offset = useSyncExternalStore(noop, () => new Date().getTimezoneOffset(), () => 0);
  const startDefault = event ? toLocalInput(event.starts_at, allDay) : "";
  const endDefault = event ? toLocalInput(event.ends_at, allDay) : "";

  return (
    <ActionForm action={saveEvent} className="flex flex-col gap-3">
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="org_slug" value={orgSlug} />
      <input type="hidden" name="tz_offset" value={offset} />
      {event && <input type="hidden" name="event_id" value={event.id} />}
      <Field label="Title">
        <Input name="title" defaultValue={event?.title} required maxLength={200} />
      </Field>
      {!event && projects.length > 0 && (
        <Field label="Project">
          <Select name="project_id" defaultValue={defaultProjectId ?? ""}>
            <option value="">Whole organization</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--brand)]" />
        All day
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input key={`s${allDay}`} name="starts_at" type={allDay ? "date" : "datetime-local"} defaultValue={startDefault} required />
        </Field>
        <Field label="Ends">
          <Input key={`e${allDay}`} name="ends_at" type={allDay ? "date" : "datetime-local"} defaultValue={endDefault} />
        </Field>
      </div>
      <Field label="Where">
        <Input name="location" defaultValue={event?.location ?? ""} placeholder="Room, address or call link" maxLength={500} />
      </Field>
      <Field label="Details">
        <Textarea name="description" defaultValue={event?.description ?? ""} rows={3} maxLength={5000} />
      </Field>
      {people.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Invite</legend>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="attendees" value={p.id} defaultChecked={event?.attendees.includes(p.id)} className="accent-[var(--brand)]" />
                {p.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">For project events, only people on that project can be invited.</p>
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="client_visible" defaultChecked={event?.client_visible} className="accent-[var(--brand)]" />
        Show to clients on the project
      </label>
      <SubmitButton pendingText="Saving...">{event ? "Save event" : "Create event"}</SubmitButton>
    </ActionForm>
  );
}
