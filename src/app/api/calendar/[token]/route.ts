import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { APP_NAME } from "@/lib/brand";

type Row = {
  uid: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
};

// RFC 5545 text escaping and 75-octet line folding.
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

// Private iCal feed: events you attend and tasks assigned to you.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/calendar/[token]">) {
  const { token } = await ctx.params;
  const clean = token.replace(/\.ics$/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) return new NextResponse("Not found", { status: 404 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("calendar_feed", { _token: clean });
  if (error) return new NextResponse("Not found", { status: 404 });

  const now = stamp(new Date().toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${APP_NAME}//Calendar//EN`, "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(APP_NAME)}`];
  for (const r of (data ?? []) as Row[]) {
    lines.push("BEGIN:VEVENT", `UID:${r.uid}@${APP_NAME.toLowerCase()}`, `DTSTAMP:${now}`);
    if (r.all_day) {
      const end = new Date(new Date(r.ends_at).getTime() + 86400000).toISOString();
      lines.push(`DTSTART;VALUE=DATE:${day(r.starts_at)}`, `DTEND;VALUE=DATE:${day(end)}`);
    } else {
      lines.push(`DTSTART:${stamp(r.starts_at)}`, `DTEND:${stamp(r.ends_at)}`);
    }
    lines.push(`SUMMARY:${esc(r.title)}`);
    if (r.location) lines.push(`LOCATION:${esc(r.location)}`);
    if (r.description) lines.push(`DESCRIPTION:${esc(r.description)}`);
    if (r.url) lines.push(`URL:${r.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
