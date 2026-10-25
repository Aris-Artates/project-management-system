import type { Metadata } from "next";
import { getSupabase, requireProfile, displayName } from "@/lib/session";
import { adminSetPlatformRole } from "@/lib/actions/admin";
import { ActionForm, AutoSubmitSelect, SubmitButton } from "@/components/form";
import { startImpersonation } from "@/lib/actions/dev";
import { Avatar, Badge, Card, Input, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "People" };

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireProfile("/admin/users");
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.trim() : "";
  const supabase = await getSupabase();

  let query = supabase.from("profiles").select("id, email, full_name, avatar_url, platform_role, created_at").order("created_at", { ascending: false }).limit(200);
  if (term) query = query.or(`email.ilike.%${term.replace(/[%,()]/g, "")}%,full_name.ilike.%${term.replace(/[%,()]/g, "")}%`);
  const [{ data: people }, { data: memberships }] = await Promise.all([
    query,
    supabase.from("org_members").select("user_id, organization:organizations(name), role:roles(name)"),
  ]);
  const orgsByUser = new Map<string, string[]>();
  for (const m of (memberships ?? []) as unknown as { user_id: string; organization: { name: string }; role: { name: string } }[]) {
    orgsByUser.set(m.user_id, [...(orgsByUser.get(m.user_id) ?? []), `${m.organization.name} (${m.role.name})`]);
  }
  const isDev = me.platform_role === "dev";

  return (
    <div>
      <PageHeader title="People" description={isDev ? "Devs can grant platform roles." : "Only Devs can change platform roles."} />
      <form className="mb-4 max-w-sm">
        <Input name="q" defaultValue={term} placeholder="Search by name or email" />
      </form>
      <Card>
        <ul className="divide-y divide-line">
          {(people ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={displayName(p)} src={p.avatar_url} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName(p)}</p>
                <p className="truncate text-xs text-muted">
                  {p.email} · joined {formatDate(p.created_at)}
                </p>
                {orgsByUser.get(p.id) && <p className="truncate text-xs text-muted">{orgsByUser.get(p.id)!.join(", ")}</p>}
              </div>
              {isDev && p.id !== me.id && p.platform_role !== "dev" && (
                <ActionForm action={startImpersonation} showOk={false}>
                  <input type="hidden" name="user_id" value={p.id} />
                  <SubmitButton size="sm" variant="ghost" pendingText="Switching...">
                    Sign in as
                  </SubmitButton>
                </ActionForm>
              )}
              {isDev && p.id !== me.id ? (
                <ActionForm action={adminSetPlatformRole} showOk={false}>
                  <input type="hidden" name="user_id" value={p.id} />
                  <AutoSubmitSelect
                    name="platform_role"
                    defaultValue={p.platform_role ?? ""}
                    className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                  >
                    <option value="">No platform role</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="dev">Dev</option>
                  </AutoSubmitSelect>
                </ActionForm>
              ) : (
                p.platform_role && <Badge tone="brand">{p.platform_role === "dev" ? "Dev" : "Super Admin"}</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
