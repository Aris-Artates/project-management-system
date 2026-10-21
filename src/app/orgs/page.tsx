import Link from "next/link";
import type { Metadata } from "next";
import { getSupabase, requireProfile, displayName } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/form";
import { Badge, Card, CardHeader, Field, Input, LinkButton } from "@/components/ui";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/lib/brand";
import { signOut } from "../(auth)/actions";
import { createOrganization } from "./actions";

export const metadata: Metadata = { title: "Your organizations" };

type Row = {
  status: string;
  organization: { name: string; slug: string; status: string };
  role: { name: string; system_key: string | null };
};

export default async function OrgsPage() {
  const profile = await requireProfile("/orgs");
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("org_members")
    .select("status, organization:organizations(name, slug, status), role:roles(name, system_key)")
    .eq("user_id", profile.id)
    .order("joined_at");
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Logo />
          {APP_NAME}
        </div>
        <div className="flex items-center gap-2">
          {profile.platform_role && (
            <LinkButton href="/admin" variant="secondary" size="sm">
              Platform admin
            </LinkButton>
          )}
          <form action={signOut}>
            <button className="text-sm text-muted hover:text-fg">Sign out</button>
          </form>
        </div>
      </header>

      <h1 className="text-2xl font-semibold">Hi {displayName(profile)}</h1>
      <p className="mt-1 text-sm text-muted">Choose an organization to open.</p>

      <div className="mt-6 flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
            You are not part of any organization yet. Create one below, or open the invitation link you were sent.
          </p>
        )}
        {rows.map((r) => {
          const client = r.role.system_key === "client";
          const disabled = r.status !== "active" || r.organization.status !== "active";
          const href = client ? `/portal/${r.organization.slug}` : `/${r.organization.slug}`;
          return (
            <Link
              key={r.organization.slug}
              href={disabled ? "#" : href}
              aria-disabled={disabled}
              className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 hover:border-brand aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              <div>
                <p className="font-medium">{r.organization.name}</p>
                <p className="text-xs text-muted">{r.role.name}</p>
              </div>
              {r.organization.status !== "active" ? (
                <Badge tone="danger">Suspended</Badge>
              ) : r.status !== "active" ? (
                <Badge>Deactivated</Badge>
              ) : client ? (
                <Badge tone="ember">Client</Badge>
              ) : null}
            </Link>
          );
        })}
      </div>

      <Card className="mt-10">
        <CardHeader title="Create an organization" description="You will be its Org Admin." />
        <ActionForm action={createOrganization} className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" placeholder="Acme Studio" required minLength={2} maxLength={80} />
          </Field>
          <Field label="URL" hint="Lowercase letters, numbers and dashes">
            <Input name="slug" placeholder="acme" required pattern="[a-z0-9-]{1,40}" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Creating...">Create organization</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </main>
  );
}
