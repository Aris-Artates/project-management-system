import { getProjectContext } from "@/lib/session";
import { getAttachments } from "@/lib/queries";
import { AttachmentList } from "@/components/attachment-list";
import { FileUpload } from "@/components/file-upload";
import { Card, CardHeader } from "@/components/ui";

export default async function FilesPage({ params }: PageProps<"/[org]/projects/[key]/files">) {
  const { org: slug, key } = await params;
  const ctx = await getProjectContext(slug, key);
  const files = await getAttachments(ctx.project.id);
  const base = `/${slug}/projects/${ctx.project.key}`;

  return (
    <Card>
      <CardHeader
        title={`Files (${files.length})`}
        description="Files marked Client are visible in the client portal."
        action={ctx.canProject("file.upload") ? <FileUpload orgId={ctx.org.id} projectId={ctx.project.id} /> : undefined}
      />
      <div className="px-4 py-2">
        <AttachmentList
          files={files}
          orgSlug={slug}
          meId={ctx.profile.id}
          canDeleteAny={ctx.canProject("file.delete_any")}
          isClient={false}
          taskHref={(n) => `${base}/tasks/${n}`}
        />
      </div>
    </Card>
  );
}
