import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAal, getProfile } from "@/lib/session";
import { Card } from "@/components/ui";
import { MfaChallenge } from "@/components/mfa-challenge";

export const metadata: Metadata = { title: "Two-factor sign-in" };

export default async function MfaPage({ searchParams }: PageProps<"/login/mfa">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/orgs";
  if (!(await getProfile())) redirect("/login");
  const aal = await getAal();
  if (aal.current === "aal2" || aal.next !== "aal2") redirect(target);

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Enter your code</h1>
      <p className="mt-1 mb-5 text-sm text-muted">Open your authenticator app and enter the 6-digit code.</p>
      <MfaChallenge next={target} />
    </Card>
  );
}
