import Link from "next/link";
import { cn, todayISO } from "@/lib/utils";

export type CalendarItem = { id: string; date: string; label: string; href: string; color: string; done: boolean };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Month grid starting on Monday. `month` is "YYYY-MM".
export function MonthCalendar({ month, items, hrefFor }: { month: string; items: CalendarItem[]; hrefFor: (m: string) => string }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const prev = iso(new Date(y, m - 2, 1)).slice(0, 7);
  const next = iso(new Date(y, m, 1)).slice(0, 7);
  const today = todayISO();
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-semibold">{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <div className="ml-auto flex gap-1">
          <Link href={hrefFor(prev)} className="rounded-lg border border-line-strong bg-surface px-3 py-1 text-sm hover:bg-surface-2">
            Previous
          </Link>
          <Link href={hrefFor(today.slice(0, 7))} className="rounded-lg border border-line-strong bg-surface px-3 py-1 text-sm hover:bg-surface-2">
            Today
          </Link>
          <Link href={hrefFor(next)} className="rounded-lg border border-line-strong bg-surface px-3 py-1 text-sm hover:bg-surface-2">
            Next
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-[var(--radius-card)] border border-line bg-line gap-px">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-surface-2 px-2 py-1.5 text-xs font-medium text-muted">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const key = iso(d);
            const inMonth = d.getMonth() === m - 1;
            const list = byDay.get(key) ?? [];
            return (
              <div key={key} className={cn("min-h-24 bg-surface p-1.5", !inMonth && "bg-bg")}>
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs",
                    !inMonth && "text-muted",
                    key === today && "bg-brand font-semibold text-on-brand",
                  )}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {list.slice(0, 4).map((it) => (
                    <Link
                      key={it.id}
                      href={it.href}
                      className={cn("truncate rounded px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80", it.done && "line-through opacity-60")}
                      style={{ background: it.color + "22", color: it.color }}
                    >
                      {it.label}
                    </Link>
                  ))}
                  {list.length > 4 && <span className="px-1 text-[11px] text-muted">+{list.length - 4} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
