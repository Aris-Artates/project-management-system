import Link from "next/link";
import type { Metadata } from "next";
import { requireProfile, getSupabase, displayName } from "@/lib/session";
import { resetCalendarFeed, updateProfile } from "@/lib/actions/account";
import { ActionForm, SubmitButton } from "@/components/form";
import { MfaSettings } from "@/components/mfa-settings";
import { Button, Card, CardHeader, Field, Input, Notice } from "@/components/ui";
import { Logo } from "@/components/logo";
import { appUrl } from "@/lib/email";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const profile = await requireProfile("/account");
  const supabase = await getSupabase();
  const { data: feed } = await supabase.from("calendar_feeds").select("token").eq("user_id", profile.id).maybeSingle();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/orgs" className="flex items-center gap-2 font-semibold">
          <Logo /> {APP_NAME}
        </Link>
        <Link href="/orgs" className="text-sm text-muted hover:text-fg">
          Back to organizations
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Your account</h1>
      <p className="mt-1 text-sm text-muted">{profile.email}</p>

      {sp.mfa === "required" && (
        <div className="mt-4">
          <Notice tone="warning">
            {typeof sp.org === "string" ? sp.org : "This organization"} requires two-factor authentication. Set up an authenticator app below,
            then open the organization again.
          </Notice>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <Card>
          <CardHeader title="Profile" />
          <ActionForm action={updateProfile} className="flex flex-col gap-3 p-4">
            <Field label="Full name">
              <Input name="full_name" defaultValue={profile.full_name ?? ""} required maxLength={80} />
            </Field>
            <Field label="Photo URL" hint="Optional, a link to a square image">
              <Input name="avatar_url" type="url" defaultValue={profile.avatar_url ?? ""} />
            </Field>
            <div>
              <SubmitButton size="sm">Save</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader title="Two-factor authentication" />
          <div className="p-4">
            <MfaSettings />
          </div>
        </Card>

        <Card>
          <CardHeader title="Calendar subscription" description="See your meetings and task due dates in Google Calendar, Outlook or Apple Calendar." />
          <div className="flex flex-col gap-3 p-4 text-sm">
            {feed ? (
              <>
                <p>Add this address as a calendar subscription (&quot;From URL&quot; in Google Calendar). Keep it private: anyone with it can read your schedule.</p>
                <code className="block break-all rounded-lg bg-surface-2 p-2 text-xs">{appUrl(`/api/calendar/${feed.token}.ics`)}</code>
              </>
            ) : (
              <p className="text-muted">No calendar link yet.</p>
            )}
            <form action={resetCalendarFeed}>
              <Button size="sm" variant="secondary">
                {feed ? "Reset link (the old one stops working)" : "Create calendar link"}
              </Button>
            </form>
          </div>
        </Card>
        <p className="text-xs text-muted">Signed in as {displayName(profile)}.</p>
      </div>
    </main>
  );
}
