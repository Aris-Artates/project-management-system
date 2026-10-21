import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrgContext, getSupabase } from "@/lib/session";
import { deleteRole, duplicateRole, updateRole } from "@/lib/actions/org";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/form";
import { PermissionMatrix } from "@/components/permission-matrix";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, PageHeader } from "@/components/ui";
import type { CatalogEntry, Role } from "@/lib/types";

export default async function RolePage({ params }: PageProps<"/[org]/roles/[id]">) {
  const { org: slug, id } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("role.manage")) redirect(`/${slug}`);
  const supabase = await getSupabase();

  const [{ data: role }, { data: catalog }, { count }] = await Promise.all([
    supabase.from("roles").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("permission_catalog").select("*").order("sort"),
    supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("role_id", id),
  ]);
  if (!role) notFound();
  const r = role as Role;
  const mode = r.system_key === "org_admin" ? "admin" : r.system_key === "client" ? "client" : "custom";
  const h = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 text-sm text-muted">
        <Link href={`/${slug}/roles`} className="hover:text-fg">
          Roles and access
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {r.name} {r.system_key && <Badge tone={r.system_key === "client" ? "ember" : "brand"}>Preset</Badge>}
          </span>
        }
        description={`${count ?? 0} people have this role`}
        actions={
          !r.system_key && (
            <form action={duplicateRole}>
              {h("org_slug", slug)}
              {h("role_id", r.id)}
              <Button variant="secondary" size="sm">
                Duplicate
              </Button>
            </form>
          )
        }
      />

      {mode === "admin" && (
        <div className="mb-4">
          <Notice tone="brand">Org Admins can do everything in this organization. Their permissions cannot be narrowed.</Notice>
        </div>
      )}
      {mode === "client" && (
        <div className="mb-4">
          <Notice tone="ember">
            Clients only see projects they are added to, and only tasks, files, milestones and comments shared with them. You can allow a
            few extra actions below.
          </Notice>
        </div>
      )}

      <Card>
        <CardHeader title="Permissions" />
        <ActionForm action={updateRole} className="flex flex-col gap-4 p-4">
          {h("org_slug", slug)}
          {h("role_id", r.id)}
          {h("system_key", r.system_key ?? "")}
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <Field label="Name">
              <Input name="name" defaultValue={r.name} required maxLength={40} disabled={!!r.system_key} />
            </Field>
            {r.system_key && h("name", r.name)}
            <Field label="Description">
              <Input name="description" defaultValue={r.description ?? ""} maxLength={200} />
            </Field>
            <Field label="Color">
              <Input name="color" type="color" defaultValue={r.color} className="w-14 p-1" />
            </Field>
          </div>
          <PermissionMatrix catalog={(catalog ?? []) as CatalogEntry[]} selected={r.permissions} mode={mode} />
          <div>
            <SubmitButton>Save role</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {!r.system_key && (
        <Card className="mt-6">
          <CardHeader title="Delete role" />
          <ActionForm action={deleteRole} className="flex flex-wrap items-center gap-3 p-4">
            {h("org_slug", slug)}
            {h("role_id", r.id)}
            <p className="flex-1 text-sm text-muted">Members must be moved to another role before it can be deleted.</p>
            <ConfirmButton message={`Delete the ${r.name} role?`} size="md">
              Delete role
            </ConfirmButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
