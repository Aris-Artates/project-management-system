import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { connectGithub, createApiKey, createWebhook, deleteWebhook, disconnectGithub, revokeApiKey, toggleWebhook } from "@/lib/actions/admin-org";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { appUrl } from "@/lib/email";
import { timeAgo } from "@/lib/utils";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";

export default async function IntegrationsPage({ params }: PageProps<"/[org]/settings/integrations">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("integration.manage")) redirect(`/${slug}/settings`);
  const supabase = await getSupabase();
  const [{ data: keys }, { data: hooks }, { data: github }, { data: projects }] = await Promise.all([
    supabase.from("api_keys").select("id, name, prefix, scopes, created_at, last_used_at, revoked_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
    supabase.from("webhooks").select("id, name, kind, url, events, enabled, secret, project_id").eq("org_id", ctx.org.id).order("created_at"),
    supabase.from("integrations").select("id, secret, created_at").eq("org_id", ctx.org.id).eq("kind", "github").maybeSingle(),
    supabase.from("projects").select("id, key, name").eq("org_id", ctx.org.id).neq("status", "archived").order("name"),
  ]);
  const logs = await Promise.all(
    (hooks ?? []).map(async (w) => (await supabase.rpc("webhook_log", { _webhook: w.id })).data as { event: string; created_at: string; status_code: number | null; error: string | null }[] | null),
  );
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const common = (
    <>
      {h("org_id", ctx.org.id)}
      {h("org_slug", slug)}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="API keys"
          description="For scripts and other tools. Keys act for the whole organization."
          action={
            <Link href={`/${slug}/settings/integrations/api`} className="text-sm text-brand">
              API reference
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {(keys ?? []).length === 0 && <li className="px-4 py-3 text-sm text-muted">No keys yet.</li>}
          {(keys ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium">{k.name}</span>
              <code className="rounded bg-surface-2 px-1.5 text-xs">{k.prefix}…</code>
              {k.scopes.map((s: string) => (
                <Badge key={s}>{s}</Badge>
              ))}
              <span className="ml-auto text-xs text-muted">{k.last_used_at ? `Used ${timeAgo(k.last_used_at)}` : "Never used"}</span>
              {k.revoked_at ? (
                <Badge tone="danger">Revoked</Badge>
              ) : (
                <form action={revokeApiKey}>
                  {h("id", k.id)}
                  {h("org_slug", slug)}
                  <ConfirmButton message={`Revoke ${k.name}? Anything using it stops working.`} variant="ghost">
                    Revoke
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={createApiKey} resetOnSuccess className="flex flex-wrap items-center gap-3 border-t border-line p-3">
          {common}
          <Input name="name" placeholder="Key name, e.g. Reporting script" required maxLength={80} className="min-w-56 flex-1" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="scopes" value="read" defaultChecked className="accent-[var(--brand)]" /> Read
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="scopes" value="write" className="accent-[var(--brand)]" /> Write
          </label>
          <SubmitButton size="sm">Create key</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Webhooks and Slack" description="Send events to another service as they happen." />
        <ul className="divide-y divide-line">
          {(hooks ?? []).length === 0 && <li className="px-4 py-3 text-sm text-muted">No webhooks yet.</li>}
          {(hooks ?? []).map((w, i) => (
            <li key={w.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{w.name}</span>
                <Badge tone={w.kind === "slack" ? "ember" : "neutral"}>{w.kind === "slack" ? "Slack" : "JSON"}</Badge>
                {!w.enabled && <Badge tone="warning">Paused</Badge>}
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{w.url}</span>
                <form action={toggleWebhook}>
                  {h("id", w.id)}
                  {h("org_slug", slug)}
                  {h("enabled", String(!w.enabled))}
                  <Button size="sm" variant="ghost">
                    {w.enabled ? "Pause" : "Resume"}
                  </Button>
                </form>
                <form action={deleteWebhook}>
                  {h("id", w.id)}
                  {h("org_slug", slug)}
                  <ConfirmButton message="Delete this webhook?" variant="ghost">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
              <p className="text-xs text-muted">
                Events: {w.events.join(", ")}
                {w.project_id ? ` · project ${(projects ?? []).find((p) => p.id === w.project_id)?.key ?? ""}` : ""}
              </p>
              {w.kind === "generic" && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">Signing secret</summary>
                  <p className="mt-1">
                    Each request has an <code>X-Signature: sha256=…</code> header: the HMAC-SHA256 of the raw body with this secret.
                  </p>
                  <code className="mt-1 block break-all rounded bg-surface-2 p-2">{w.secret}</code>
                </details>
              )}
              {(logs[i] ?? []).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted">Recent deliveries</summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {(logs[i] ?? []).map((d, j) => (
                      <li key={j} className="flex gap-3">
                        <span className="w-20 text-muted">{timeAgo(d.created_at)}</span>
                        <span className="w-40 truncate">{d.event}</span>
                        <span className={d.status_code && d.status_code < 300 ? "text-success" : "text-danger"}>
                          {d.status_code ?? (d.error ? "failed" : "pending")}
                        </span>
                        {d.error && <span className="truncate text-muted">{d.error}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={createWebhook} resetOnSuccess className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          {common}
          <Field label="Type">
            <Select name="kind" defaultValue="slack">
              <option value="slack">Slack incoming webhook</option>
              <option value="generic">JSON webhook</option>
            </Select>
          </Field>
          <Field label="Name">
            <Input name="name" placeholder="#project-updates" maxLength={80} />
          </Field>
          <Field label="URL" className="sm:col-span-2" hint="For Slack: create an incoming webhook in your Slack app and paste its URL">
            <Input name="url" type="url" required placeholder="https://hooks.slack.com/services/..." />
          </Field>
          <Field label="Only for project">
            <Select name="project_id" defaultValue="">
              <option value="">All projects</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            <div className="grid gap-1 sm:grid-cols-3">
              {WEBHOOK_EVENTS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="events" value={value} defaultChecked={value === "*"} className="accent-[var(--brand)]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <SubmitButton size="sm">Add webhook</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="GitHub" description="Mention a task like WEB-12 in a commit to link it. Write 'fixes WEB-12' to close it." />
        {github ? (
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p>In your GitHub repository, open Settings, then Webhooks, then Add webhook, and enter:</p>
            <dl className="grid gap-2 sm:grid-cols-[140px_1fr]">
              <dt className="text-muted">Payload URL</dt>
              <dd>
                <code className="break-all rounded bg-surface-2 px-1.5 py-0.5">{appUrl(`/api/integrations/github/${slug}`)}</code>
              </dd>
              <dt className="text-muted">Content type</dt>
              <dd>
                <code className="rounded bg-surface-2 px-1.5 py-0.5">application/json</code>
              </dd>
              <dt className="text-muted">Secret</dt>
              <dd>
                <code className="break-all rounded bg-surface-2 px-1.5 py-0.5">{github.secret}</code>
              </dd>
              <dt className="text-muted">Events</dt>
              <dd>Just the push event</dd>
            </dl>
            <form action={disconnectGithub}>
              {h("id", github.id)}
              {h("org_slug", slug)}
              <ConfirmButton message="Disconnect GitHub? Existing webhooks in GitHub will start failing." variant="ghost">
                Disconnect
              </ConfirmButton>
            </form>
          </div>
        ) : (
          <form action={connectGithub} className="p-4">
            {common}
            <Button size="sm">Connect GitHub</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
