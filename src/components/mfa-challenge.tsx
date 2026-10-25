"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/(auth)/actions";
import { Button, Input } from "./ui";

export function MfaChallenge({ next }: { next: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      return setError("No authenticator app is set up on this account.");
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) {
      setBusy(false);
      return setError("That code did not work. Try the newest code from your app.");
    }
    // Full navigation so the server sees the upgraded session cookie.
    window.location.assign(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          autoFocus
          aria-label="Authentication code"
        />
        <Button type="submit" disabled={busy || code.trim().length !== 6}>
          {busy ? "Checking..." : "Continue"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
      <form action={signOut}>
        <button className="text-sm text-muted hover:text-fg">Sign in with a different account</button>
      </form>
    </div>
  );
}
