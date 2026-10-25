// Helpers for weekly report buckets. Weeks start on Monday (UTC).

export function weekStarts(count: number, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() - (count - 1 - i) * 7);
    return x.toISOString().slice(0, 10);
  });
}

export function weekLabel(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Index of the week a date falls in, or -1 if before the first week.
export function weekIndex(starts: string[], date: string | null | undefined) {
  if (!date) return -1;
  const day = date.slice(0, 10);
  for (let i = starts.length - 1; i >= 0; i--) if (day >= starts[i]!) return i;
  return -1;
}

export function countByWeek(starts: string[], dates: (string | null | undefined)[]) {
  const out = starts.map(() => 0);
  for (const d of dates) {
    const i = weekIndex(starts, d);
    if (i >= 0) out[i]!++;
  }
  return out;
}

export function sumByWeek(starts: string[], rows: { date: string; value: number }[]) {
  const out = starts.map(() => 0);
  for (const r of rows) {
    const i = weekIndex(starts, r.date);
    if (i >= 0) out[i]! += r.value;
  }
  return out;
}

export const hours = (min: number) => Math.round((min / 60) * 10) / 10;
export const fmtHours = (h: number) => `${h}h`;

export type Health = "on_track" | "at_risk" | "off_track" | "done";

// Project health from schedule, overdue work and open blocker bugs.
export function projectHealth(p: {
  status: string;
  start: string | null;
  end: string | null;
  total: number;
  done: number;
  overdue: number;
  blockers: number;
  today: string;
}): { health: Health; reason: string } {
  if (p.status === "completed") return { health: "done", reason: "Completed" };
  const open = p.total - p.done;
  const progress = p.total ? p.done / p.total : 0;
  if (p.end && p.end < p.today && open > 0) return { health: "off_track", reason: "Past its due date with open work" };
  if (open > 0 && p.overdue / open > 0.25) {
    return { health: "off_track", reason: `${p.overdue} of ${open} open task${open === 1 ? "" : "s"} overdue` };
  }
  if (p.start && p.end && p.end > p.start) {
    const span = Date.parse(p.end) - Date.parse(p.start);
    const elapsed = Math.min(1, Math.max(0, (Date.parse(p.today) - Date.parse(p.start)) / span));
    if (elapsed - progress > 0.25) return { health: "at_risk", reason: `${Math.round(elapsed * 100)}% of time used, ${Math.round(progress * 100)}% done` };
  }
  if (p.blockers > 0) return { health: "at_risk", reason: `${p.blockers} critical or blocker bug${p.blockers === 1 ? "" : "s"}` };
  if (p.overdue > 0) return { health: "at_risk", reason: `${p.overdue} overdue task${p.overdue === 1 ? "" : "s"}` };
  return { health: "on_track", reason: "On schedule" };
}
