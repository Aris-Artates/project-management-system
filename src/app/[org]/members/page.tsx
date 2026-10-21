import type { Metadata } from "next";
import { getOrgContext, getSupabase, displayName } from "@/lib/session";
import { inviteMember, revokeInvitation, setMemberStatus, updateMemberRole } from "@/lib/actions/org";
import { ActionForm, AutoSubmitSelect, SubmitButton } from "@/components/form";
import { Avatar, Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import type { Role } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Members" };

type Member = {
  user_id: string;
  status: string;
  joined_at: string;
  role_id: string;
  profile: { id: string; full_name: string | null; email: string; avatar_url: string | null };
};

export default async function MembersPage({ params }: PageProps<"/[org]/members">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const supabase = await getSupabase();
  const canInviteMembers = ctx.can("member.invite");
  const canInviteClients = ctx.can("client.invite");
  const canManage = ctx.can("member.manage");

  const [{ data: members }, { data: roles }, { data: invites }, { data: projects }] = await Promise.all([
    supabase
      .from("org_members")
      .select("user_id, status, joined_at, role_id, profile:profiles!org_members_user_id_fkey(id, full_name, email, avatar_url)")
      .eq("org_id", ctx.org.id)
      .order("joined_at"),
    supabase.from("roles").select("*").eq("org_id", ctx.org.id).order("position"),
    canInviteMembers || canInviteClients
      ? supabase.from("invitations").select("id, email, role_id, expires_at, created_at").eq("org_id", ctx.org.id).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("projects").select("id, key, name").eq("org_id", ctx.org.id).neq("status", "archived").order("name"),
  ]);

  const roleList = (roles ?? []) as Role[];
  const roleById = new Map(roleList.map((r) => [r.id, r]));
  const list = (members ?? []) as unknown as Member[];
  const team = list.filter((m) => roleById.get(m.role_id)?.system_key !== "client");
  const clients = list.filter((m) => roleById.get(m.role_id)?.system_key === "client");
  const invitable = roleList.filter((r) =>
    r.system_key === "client" ? canInviteClients : canInviteMembers && (r.system_key !== "org_admin" || ctx.isOrgAdmin),
  );
  const assignable = roleList.filter((r) => r.system_key !== "org_admin" || ctx.isOrgAdmin);
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  const memberRows = (rows: Member[]) => (
    <ul className="divide-y divide-line">
      {rows.map((m) => {
        const role = roleById.get(m.role_id);
        const self = m.user_id === ctx.profile.id;
        return (
          <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={displayName(m.profile)} src={m.profile.avatar_url} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {displayName(m.profile)} {self && <span className="text-muted">(you)</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {m.profile.email} · joined {formatDate(m.joined_at)}
              </p>
            </div>
            {m.status !== "active" && <Badge tone="danger">Deactivated</Badge>}
            {canManage && !self && (role?.system_key !== "org_admin" || ctx.isOrgAdmin) ? (
              <>
                <ActionForm action={updateMemberRole} showOk={false}>
                  {h("org_id", ctx.org.id)}
                  {h("org_slug", slug)}
                  {h("user_id", m.user_id)}
                  <AutoSubmitSelect name="role_id" defaultValue={m.role_id} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm">
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </AutoSubmitSelect>
                </ActionForm>
                <ActionForm action={setMemberStatus} showOk={false}>
                  {h("org_id", ctx.org.id)}
                  {h("org_slug", slug)}
                  {h("user_id", m.user_id)}
                  {h("status", m.status === "active" ? "deactivated" : "active")}
                  <SubmitButton variant="ghost" size="sm">
                    {m.status === "active" ? "Deactivate" : "Reactivate"}
                  </SubmitButton>
                </ActionForm>
              </>
            ) : (
              <Badge tone={role?.system_key === "client" ? "ember" : role?.system_key === "org_admin" ? "brand" : "neutral"}>{role?.name}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Members" description={`${team.length} team members, ${clients.length} clients`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Team" />
            {memberRows(team)}
          </Card>
          <Card>
            <CardHeader title="Clients" description="Clients only see the projects they are added to." />
            {clients.length ? memberRows(clients) : <p className="p-4 text-sm text-muted">No clients yet.</p>}
          </Card>
          {(invites ?? []).length > 0 && (
            <Card>
              <CardHeader title="Pending invitations" />
              <ul className="divide-y divide-line">
                {(invites ?? []).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{i.email}</span>
                    <Badge>{roleById.get(i.role_id)?.name}</Badge>
                    <span className={`text-xs ${new Date(i.expires_at) < new Date() ? "text-danger" : "text-muted"}`}>
                      {new Date(i.expires_at) < new Date() ? "Expired" : `Expires ${formatDate(i.expires_at)}`}
                    </span>
                    <form action={revokeInvitation}>
                      {h("id", i.id)}
                      {h("org_slug", slug)}
                      <button className="text-xs text-muted hover:text-danger">Revoke</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {invitable.length > 0 && (
          <Card className="self-start">
            <CardHeader title="Invite someone" description="They get an email with a link to join." />
            <ActionForm action={inviteMember} resetOnSuccess className="flex flex-col gap-3 p-4">
              {h("org_id", ctx.org.id)}
              {h("org_slug", slug)}
              <Field label="Email">
                <Input name="email" type="email" required placeholder="name@company.com" />
              </Field>
              <Field label="Role">
                <Select name="role_id" required defaultValue={invitable.find((r) => !r.system_key)?.id ?? invitable[0]?.id}>
                  {invitable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {(projects ?? []).length > 0 && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 text-sm font-medium">Projects</legend>
                  <p className="mb-1 text-xs text-muted">Required for clients. Optional for team members.</p>
                  <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                    {(projects ?? []).map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="project_ids" value={p.id} className="accent-[var(--brand)]" />
                        <span className="font-mono text-xs text-muted">{p.key}</span> {p.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <SubmitButton pendingText="Sending...">Send invitation</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
