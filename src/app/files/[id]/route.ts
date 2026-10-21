import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Short-lived signed link for an attachment the viewer is allowed to read.
export async function GET(request: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: file } = await supabase.from("attachments").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.has("download");
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(file.storage_path, 60, download ? { download: file.file_name } : undefined);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
