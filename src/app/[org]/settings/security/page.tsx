import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/session";
import { saveSecurity } from "@/lib/actions/admin-org";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, CardHeader, Field, Input, Notice } from "@/components/ui";

export default async function SecuritySettings({ params }: PageProps<"/[org]/settings/security">) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  if (!ctx.can("org.settings")) redirect(`/${slug}/settings`);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader title="Sign-in requirements" />
        <ActionForm action={saveSecurity} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="org_id" value={ctx.org.id} />
          <input type="hidden" name="org_slug" value={slug} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="require_mfa" defaultChecked={ctx.org.require_mfa} className="mt-1 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">Require two-factor authentication</span>
              <span className="block text-muted">
                Members without an authenticator app are asked to set one up before opening this organization. They can do it from their{" "}
                <Link href="/account" className="text-brand">
                  account page
                </Link>
                .
              </span>
            </span>
          </label>
          <Field label="Single sign-on domain" hint="People with this email domain can use 'Continue with SSO' on the sign-in page">
            <Input name="sso_domain" defaultValue={ctx.org.sso_domain ?? ""} placeholder="company.com" />
          </Field>
          <Notice tone="neutral">
            SSO also needs your identity provider (Okta, Microsoft Entra, Google Workspace and others, using SAML) to be registered in
            Supabase under Authentication, then Providers, then SAML 2.0. That part is done in the Supabase dashboard or CLI and needs a
            paid Supabase plan.
          </Notice>
          <div>
            <SubmitButton>Save</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
