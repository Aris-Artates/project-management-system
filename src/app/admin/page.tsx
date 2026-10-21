import Link from "next/link";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/session";
import { adminCreateOrganization, adminDeleteOrganization, adminSetOrgStatus } from "@/lib/actions/admin";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminOrgs() {
  const supabase = await getSupabase();
  const [{ data: orgs }, { data: members }, { data: projects }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, plan, status, created_at").order("created_at", { ascending: false }),
    supabase.from("org_members").select("org_id, role:roles(system_key)"),
    supabase.from("projects").select("org_id"),
  ]);

  const stats = new Map<string, { team: number; clients: number; projects: number }>();
  const bump = (id: string, k: "team" | "clients" | "projects") => {
    const s = stats.get(id) ?? { team: 0, clients: 0, projects: 0 };
    s[k]++;
    stats.set(id, s);
  };
  for (const m of (members ?? []) as unknown as { org_id: string; role: { system_key: string | null } }[]) {
    bump(m.org_id, m.role.system_key === "client" ? "clients" : "team");
  }
  for (const p of projects ?? []) bump(p.org_id, "projects");

  return (
    <div>
      <PageHeader title="Organizations" description={`${orgs?.length ?? 0} organizations on the platform`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-2 py-2 font-medium">Team</th>
                <th className="px-2 py-2 font-medium">Clients</th>
                <th className="px-2 py-2 font-medium">Projects</th>
                <th className="px-2 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(orgs ?? []).map((o) => {
                const s = stats.get(o.id) ?? { team: 0, clients: 0, projects: 0 };
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/${o.slug}`} className="font-medium hover:text-brand">
                        {o.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        /{o.slug} · {o.plan}
                      </span>
                    </td>
                    <td className="px-2">{s.team}</td>
                    <td className="px-2">{s.clients}</td>
                    <td className="px-2">{s.projects}</td>
                    <td className="px-2 text-muted">{formatDate(o.created_at)}</td>
                    <td className="px-4">
                      <div className="flex items-center justify-end gap-2">
                        {o.status === "suspended" && <Badge tone="danger">Suspended</Badge>}
                        <form action={adminSetOrgStatus}>
                          <input type="hidden" name="org_id" value={o.id} />
                          <input type="hidden" name="status" value={o.status === "active" ? "suspended" : "active"} />
                          <Button variant="secondary" size="sm">
                            {o.status === "active" ? "Suspend" : "Reactivate"}
                          </Button>
                        </form>
                        <form action={adminDeleteOrganization}>
                          <input type="hidden" name="org_id" value={o.id} />
                          <ConfirmButton message={`Permanently delete ${o.name} and all its data?`} variant="ghost">
                            Delete
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="self-start">
          <CardHeader title="New organization" description="Creates it and emails an invite to its first Org Admin." />
          <ActionForm action={adminCreateOrganization} resetOnSuccess className="flex flex-col gap-3 p-4">
            <Field label="Name">
              <Input name="name" required minLength={2} maxLength={80} />
            </Field>
            <Field label="URL">
              <Input name="slug" placeholder="acme" pattern="[a-z0-9-]{1,40}" />
            </Field>
            <Field label="Org Admin email">
              <Input name="admin_email" type="email" required />
            </Field>
            <SubmitButton pendingText="Creating...">Create and invite</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
