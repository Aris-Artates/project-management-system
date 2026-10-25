import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { appUrl } from "@/lib/email";
import { Card, CardHeader } from "@/components/ui";

const ENDPOINTS: { method: string; path: string; scope: string; body?: string; text: string }[] = [
  { method: "GET", path: "/api/v1/projects", scope: "read", text: "List projects with open task counts." },
  { method: "GET", path: "/api/v1/projects/{KEY}/tasks?state=open|done|all&limit=50&offset=0", scope: "read", text: "List tasks in a project." },
  {
    method: "POST",
    path: "/api/v1/projects/{KEY}/tasks",
    scope: "write",
    body: '{ "title": "Fix login", "priority": "high", "due_date": "2026-11-01", "status": "To do" }',
    text: "Create a task. Only title is required.",
  },
  { method: "GET", path: "/api/v1/projects/{KEY}/tasks/{number}", scope: "read", text: "Get one task, e.g. /api/v1/projects/WEB/tasks/12." },
  {
    method: "PATCH",
    path: "/api/v1/projects/{KEY}/tasks/{number}",
    scope: "write",
    body: '{ "status": "Done" }',
    text: "Update title, description, priority, start_date, due_date, estimate_hours, client_visible or status (by name).",
  },
  { method: "GET", path: "/api/v1/time-entries?from=2026-10-01&to=2026-10-31", scope: "read", text: "Time entries in a date range (default: last 30 days)." },
];

export default async function ApiReference({ params }: PageProps<"/[org]/settings/integrations/api">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("integration.manage")) redirect(`/${slug}/settings`);
  const base = appUrl("");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Authentication" />
        <div className="flex flex-col gap-2 p-4 text-sm">
          <p>Send your key as a bearer token. Responses are JSON; errors have an HTTP status and an error message.</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{`curl ${base}/api/v1/projects \\
  -H "Authorization: Bearer pms_your_key"`}</pre>
        </div>
      </Card>
      <Card>
        <CardHeader title="Endpoints" />
        <ul className="divide-y divide-line">
          {ENDPOINTS.map((e) => (
            <li key={e.method + e.path} className="flex flex-col gap-1.5 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-brand">{e.method}</span>
                <code className="break-all text-xs">{e.path}</code>
                <span className="ml-auto text-xs text-muted">{e.scope} scope</span>
              </div>
              <p className="text-muted">{e.text}</p>
              {e.body && <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">{e.body}</pre>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
