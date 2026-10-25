import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NUMBERED = { task: ["tasks", "tasks"], bug: ["bugs", "bugs"] } as const;

// Notification links: send staff to the workspace and clients to the portal.
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const supabase = await createClient();
  const home = new URL("/orgs", request.url);
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (kind === "event") {
    const { data: event } = await supabase
      .from("events")
      .select("id, org_id, project:projects(key), organization:organizations(slug)")
      .eq("id", id)
      .maybeSingle();
    if (!event) return NextResponse.redirect(home);
    const slug = (event.organization as unknown as { slug: string }).slug;
    const key = (event.project as unknown as { key: string } | null)?.key;
    const { data: isClient } = await supabase.rpc("is_org_client", { _org: event.org_id });
    return go(isClient ? `/portal/${slug}${key ? `/${key}` : ""}` : `/${slug}/events/${event.id}`);
  }

  let projectId = id;
  let staffSuffix = "";
  let clientSuffix = "";
  if (kind === "task" || kind === "bug") {
    const [table, path] = NUMBERED[kind];
    const { data: item } = await supabase.from(table).select("project_id, number").eq("id", id).maybeSingle();
    if (!item) return NextResponse.redirect(home);
    projectId = item.project_id;
    staffSuffix = clientSuffix = `/${path}/${item.number}`;
  } else if (kind === "topic" || kind === "doc") {
    const { data: item } = await supabase.from(kind === "topic" ? "topics" : "documents").select("project_id").eq("id", id).maybeSingle();
    if (!item) return NextResponse.redirect(home);
    projectId = item.project_id;
    staffSuffix = kind === "topic" ? `/discussion/${id}` : `/docs/${id}`;
    clientSuffix = kind === "topic" ? `/discussion/${id}` : `/docs/${id}`;
  } else if (kind !== "project") {
    return NextResponse.redirect(home);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("key, org_id, organization:organizations(slug)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.redirect(home);
  const slug = (project.organization as unknown as { slug: string }).slug;

  const { data: isClient } = await supabase.rpc("is_org_client", { _org: project.org_id });
  return go(isClient ? `/portal/${slug}/${project.key}${clientSuffix}` : `/${slug}/projects/${project.key}${staffSuffix}`);
}
