import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next, email } = await searchParams;
  const nextValue = typeof next === "string" ? next : "";

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Start a workspace or join one you were invited to.</p>

      <ActionForm action={signUp} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="next" value={nextValue} />
        <Field label="Full name">
          <Input name="full_name" autoComplete="name" required />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={typeof email === "string" ? email : undefined}
            required
          />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <SubmitButton pendingText="Creating...">Create account</SubmitButton>
      </ActionForm>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login${nextValue ? `?next=${encodeURIComponent(nextValue)}` : ""}`} className="font-medium text-brand">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
