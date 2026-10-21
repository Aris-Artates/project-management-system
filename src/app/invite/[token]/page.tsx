import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getProfile, getSupabase } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, LinkButton, Notice } from "@/components/ui";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/lib/brand";
import { acceptInvitation } from "./actions";

export const metadata: Metadata = { title: "Invitation" };

type Invite = {
  org_name: string;
  org_slug: string;
  email: string;
  role_name: string;
  is_client: boolean;
  expired: boolean;
  accepted: boolean;
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("get_invitation", { _token: token });
  const invite = (data as Invite[] | null)?.[0];
  const profile = await getProfile();
  const here = `/invite/${token}`;

  let body: React.ReactNode;
  if (!invite) {
    body = <Notice tone="danger">This invitation link is not valid.</Notice>;
  } else if (invite.accepted) {
    if (profile) redirect(invite.is_client ? `/portal/${invite.org_slug}` : `/${invite.org_slug}`);
    body = <Notice tone="neutral">This invitation was already accepted. Sign in to continue.</Notice>;
  } else if (invite.expired) {
    body = <Notice tone="danger">This invitation expired. Ask whoever invited you to send a new one.</Notice>;
  } else if (!profile) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Sign in or create an account with <b className="text-fg">{invite.email}</b> to accept.
        </p>
        <LinkButton href={`/signup?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`}>
          Create account
        </LinkButton>
        <LinkButton variant="secondary" href={`/login?next=${encodeURIComponent(here)}`}>
          I already have an account
        </LinkButton>
      </div>
    );
  } else if (profile.email !== invite.email) {
    body = (
      <Notice tone="warning">
        You are signed in as {profile.email}, but this invitation is for {invite.email}.{" "}
        <Link className="underline" href={`/login?next=${encodeURIComponent(here)}`}>
          Switch account
        </Link>
      </Notice>
    );
  } else {
    body = (
      <ActionForm action={acceptInvitation}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingText="Joining..." className="w-full">
          Accept and continue
        </SubmitButton>
      </ActionForm>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <Logo />
        {APP_NAME}
      </div>
      <Card className="w-full max-w-sm p-6">
        {invite && (
          <>
            <p className="text-sm text-muted">You have been invited to</p>
            <h1 className="mt-1 text-xl font-semibold">{invite.org_name}</h1>
            <p className="mt-1 mb-5 text-sm text-muted">
              {invite.is_client ? "as a client, to follow your projects" : `as ${invite.role_name}`}
            </p>
          </>
        )}
        {body}
      </Card>
    </div>
  );
}
