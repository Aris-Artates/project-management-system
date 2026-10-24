import Link from "next/link";
import { getProjectContext, displayName } from "@/lib/session";
import { getBugs, getProjectMembers, getProjectWork } from "@/lib/queries";
import { reportBug } from "@/lib/actions/bugs";
import { BUG_STATUS, OPEN_BUG_STATUSES, REPRODUCIBILITY, SEVERITY } from "@/lib/bug-meta";
import { ActionForm, SubmitButton } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import { EyeIcon } from "@/components/icons";

export default async function BugsPage({ params, searchParams }: PageProps<"/[org]/projects/[key]/bugs">) {
  const { org: slug, key } = await params;
  const sp = await searchParams;
  const ctx = await getProjectContext(slug, key);
  const [bugs, members, { tasks }] = await Promise.all([
    getBugs(ctx.project.id),
    getProjectMembers(ctx.project.id, ctx.org.id),
    getProjectWork(ctx.project.id),
  ]);
  const base = `/${slug}/projects/${ctx.project.key}/bugs`;
  const show = typeof sp.show === "string" ? sp.show : "open";
  const severity = typeof sp.severity === "string" ? sp.severity : "";
  const who = typeof sp.who === "string" ? sp.who : "";

  const visible = bugs.filter((b) => {
    if (show === "open" && !OPEN_BUG_STATUSES.includes(b.status)) return false;
    if (show === "fixed" && !["fixed", "verified"].includes(b.status)) return false;
    if (show === "closed" && b.status !== "closed") return false;
    if (severity && b.severity !== severity) return false;
    if (who === "me" && b.assignee_id !== ctx.profile.id) return false;
    if (who === "none" && b.assignee_id) return false;
    return true;
  });
  const counts = {
    open: bugs.filter((b) => OPEN_BUG_STATUSES.includes(b.status)).length,
    fixed: bugs.filter((b) => ["fixed", "verified"].includes(b.status)).length,
    closed: bugs.filter((b) => b.status === "closed").length,
  };
  const team = members.filter((m) => m.orgRole?.system_key !== "client");
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ show, severity, who, ...patch });
    [...q.keys()].forEach((k) => !q.get(k) && q.delete(k));
    return `${base}?${q}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            ["open", `Open (${counts.open})`],
            ["fixed", `Awaiting verification (${counts.fixed})`],
            ["closed", `Closed (${counts.closed})`],
            ["all", `All (${bugs.length})`],
          ].map(([v, label]) => (
            <Link
              key={v}
              href={link({ show: v! })}
              className={cn("rounded-lg px-3 py-1.5", show === v ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2")}
            >
              {label}
            </Link>
          ))}
          <form className="ml-auto flex gap-2">
            <input type="hidden" name="show" value={show} />
            <Select name="severity" defaultValue={severity} className="h-9 w-auto">
              <option value="">Any severity</option>
              {Object.entries(SEVERITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select name="who" defaultValue={who} className="h-9 w-auto">
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="none">Unassigned</option>
            </Select>
            <button className="h-9 rounded-lg border border-line-strong bg-surface px-3 hover:bg-surface-2">Apply</button>
          </form>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="No bugs here">Nice. Report one on the right when something breaks.</EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {visible.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="font-mono text-xs text-muted">
                    {ctx.project.key}-B{b.number}
                  </span>
                  <Link href={`${base}/${b.number}`} className="min-w-0 flex-1 truncate text-sm hover:text-brand">
                    {b.title}
                  </Link>
                  {b.client_visible && (
                    <span title="Visible to client" className="text-ember">
                      <EyeIcon />
                    </span>
                  )}
                  <Badge tone={SEVERITY[b.severity].tone}>{SEVERITY[b.severity].label}</Badge>
                  <Badge tone={BUG_STATUS[b.status].tone}>{BUG_STATUS[b.status].label}</Badge>
                  {b.assignee ? (
                    <Avatar name={displayName(b.assignee)} src={b.assignee.avatar_url} size={22} />
                  ) : (
                    <span className="size-[22px]" />
                  )}
                  <span className="w-16 text-right text-xs text-muted">{timeAgo(b.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {ctx.canProject("bug.create") && (
        <Card className="self-start">
          <CardHeader title="Report a bug" />
          <ActionForm action={reportBug} className="flex flex-col gap-3 p-4">
            <input type="hidden" name="org_slug" value={slug} />
            <input type="hidden" name="project_id" value={ctx.project.id} />
            <input type="hidden" name="redirect_base" value={base} />
            <Field label="Title">
              <Input name="title" required maxLength={300} placeholder="What went wrong?" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Severity">
                <Select name="severity" defaultValue="major">
                  {Object.entries(SEVERITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Happens">
                <Select name="reproducibility" defaultValue="always">
                  {Object.entries(REPRODUCIBILITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Steps to reproduce">
              <Textarea name="steps" rows={4} placeholder={"1. Open...\n2. Click...\n3. See..."} />
            </Field>
            <Field label="Environment">
              <Input name="environment" placeholder="Browser, device, version" maxLength={500} />
            </Field>
            {ctx.canProject("bug.assign") && (
              <Field label="Assignee">
                <Select name="assignee_id" defaultValue="">
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {displayName(m.profile)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Related task">
              <Select name="task_id" defaultValue="">
                <option value="">None</option>
                {tasks
                  .filter((t) => !t.parent_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {ctx.project.key}-{t.number} {t.title}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="client_visible" className="accent-[var(--brand)]" /> Client can see
            </label>
            <SubmitButton pendingText="Reporting...">Report bug</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
