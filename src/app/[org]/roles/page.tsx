import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getOrgContext, getSupabase } from "@/lib/session";
import { createRole } from "@/lib/actions/org";
import { ActionForm, SubmitButton } from "@/components/form";
import { PermissionMatrix } from "@/components/permission-matrix";
import { Badge, Card, CardHeader, Dot, Field, Input, PageHeader } from "@/components/ui";
import type { CatalogEntry, Role } from "@/lib/types";

export const metadata: Metadata = { title: "Roles and access" };

export default async function RolesPage({ params }: PageProps<"/[org]/roles">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("role.manage")) redirect(`/${slug}`);
  const supabase = await getSupabase();

  const [{ data: roles }, { data: catalog }, { data: members }] = await Promise.all([
    supabase.from("roles").select("*").eq("org_id", ctx.org.id).order("position").order("name"),
    supabase.from("permission_catalog").select("*").order("sort"),
    supabase.from("org_members").select("role_id").eq("org_id", ctx.org.id),
  ]);
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.role_id, (counts.get(m.role_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Roles and access"
        description="Org Admin and Client come with every organization. Create any other roles your team needs."
      />
      <Card className="mb-8">
        <ul className="divide-y divide-line">
          {((roles ?? []) as Role[]).map((r) => (
            <li key={r.id}>
              <Link href={`/${slug}/roles/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <Dot color={r.color} />
                <span className="font-medium">{r.name}</span>
                {r.system_key && <Badge tone={r.system_key === "client" ? "ember" : "brand"}>Preset</Badge>}
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.description}</span>
                <span className="text-xs text-muted">
                  {r.system_key === "org_admin" ? "All permissions" : `${r.permissions.length} permissions`} · {counts.get(r.id) ?? 0} people
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="New role" description="Pick what this role can do. You can change it any time." />
        <ActionForm action={createRole} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="org_id" value={ctx.org.id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <Field label="Name">
              <Input name="name" required maxLength={40} placeholder="Project Manager" />
            </Field>
            <Field label="Description">
              <Input name="description" maxLength={200} placeholder="What this role is for" />
            </Field>
            <Field label="Color">
              <Input name="color" type="color" defaultValue="#6366f1" className="w-14 p-1" />
            </Field>
          </div>
          <PermissionMatrix catalog={(catalog ?? []) as CatalogEntry[]} selected={["task.create", "task.edit_own", "comment.create", "file.upload"]} mode="custom" />
          <div>
            <SubmitButton pendingText="Creating...">Create role</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
