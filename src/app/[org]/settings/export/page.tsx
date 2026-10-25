import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { Card, CardHeader, buttonClass } from "@/components/ui";

export default async function ExportPage({ params }: PageProps<"/[org]/settings/export">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("org.settings")) redirect(`/${slug}/settings`);
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Export your data" description="A JSON file with your projects, tasks, comments, bugs, time, pages, events and invoices." />
      <div className="flex flex-col gap-3 p-4 text-sm">
        <p className="text-muted">
          Files you uploaded are not included; download them from each project&apos;s Files tab. For spreadsheets, use the CSV exports on
          the Reports page.
        </p>
        <div>
          <a href={`/${slug}/settings/export/download`} className={buttonClass("primary", "md")}>
            Download JSON export
          </a>
        </div>
      </div>
    </Card>
  );
}
