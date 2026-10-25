import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { sendMagicLink, signIn, signInWithSso } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextValue = typeof next === "string" ? next : "";

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back. Pick up where you left off.</p>
      {error && <p className="mt-3 text-sm text-danger">That sign-in link is invalid or expired.</p>}

      <ActionForm action={signIn} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={nextValue} />
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton pendingText="Signing in...">Sign in</SubmitButton>
      </ActionForm>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <ActionForm action={sendMagicLink} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={nextValue} />
        <Field label="Email me a sign-in link">
          <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </Field>
        <SubmitButton variant="secondary" pendingText="Sending...">
          Send link
        </SubmitButton>
      </ActionForm>

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Continue with single sign-on (SSO)</summary>
        <ActionForm action={signInWithSso} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="next" value={nextValue} />
          <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required aria-label="Work email" />
          <SubmitButton variant="secondary" pendingText="Redirecting...">
            Continue with SSO
          </SubmitButton>
        </ActionForm>
      </details>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href={`/signup${nextValue ? `?next=${encodeURIComponent(nextValue)}` : ""}`} className="font-medium text-brand">
          Create an account
        </Link>
      </p>
    </Card>
  );
}
