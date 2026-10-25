import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// GitHub webhook receiver. The database verifies the HMAC signature with the
// organization's secret, so this route only forwards the raw body.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/integrations/github/[org]">) {
  const { org } = await ctx.params;
  const body = await request.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("github_ingest", {
    _org_slug: org,
    _signature: request.headers.get("x-hub-signature-256") ?? "",
    _event: request.headers.get("x-github-event") ?? "",
    _body: body,
  });
  if (error) {
    const status = /signature/i.test(error.message) ? 401 : /not connected/i.test(error.message) ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
