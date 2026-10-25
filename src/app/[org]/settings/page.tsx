import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getOrgContext } from "@/lib/session";
import { updateOrganization } from "@/lib/actions/org";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, CardHeader, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/[org]/settings">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("org.settings")) redirect(`/${slug}`);

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader title="General" />
        <ActionForm action={updateOrganization} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="org_id" value={ctx.org.id} />
          <input type="hidden" name="org_slug" value={slug} />
          <Field label="Name">
            <Input name="name" defaultValue={ctx.org.name} required minLength={2} maxLength={80} />
          </Field>
          <Field label="URL" hint="Contact platform support to change it">
            <Input value={`/${ctx.org.slug}`} disabled readOnly />
          </Field>
          <Field label="Logo URL" hint="Optional, shown in the client portal">
            <Input name="logo_url" type="url" defaultValue={ctx.org.logo_url ?? ""} placeholder="https://..." />
          </Field>
          <Field label="Plan">
            <Input value={ctx.org.plan} disabled readOnly className="capitalize" />
          </Field>
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
