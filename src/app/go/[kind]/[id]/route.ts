import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Notification links: send staff to the workspace and clients to the portal.
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const supabase = await createClient();
  const home = new URL("/orgs", request.url);

  let projectId = id;
  let suffix = "";
  if (kind === "task" || kind === "bug") {
    const { data: item } = await supabase.from(kind === "task" ? "tasks" : "bugs").select("project_id, number").eq("id", id).maybeSingle();
    if (!item) return NextResponse.redirect(home);
    projectId = item.project_id;
    suffix = `/${kind === "task" ? "tasks" : "bugs"}/${item.number}`;
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
  const path = isClient ? `/portal/${slug}/${project.key}${suffix}` : `/${slug}/projects/${project.key}${suffix}`;
  return NextResponse.redirect(new URL(path, request.url));
}
