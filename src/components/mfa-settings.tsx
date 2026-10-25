"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "./ui";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

// Authenticator-app (TOTP) setup through Supabase Auth MFA.
export function MfaSettings() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await createClient().auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]).filter((f) => f.status === "verified"));
  }
  useEffect(() => {
    let alive = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => alive && setFactors(((data?.totp ?? []) as Factor[]).filter((f) => f.status === "verified")));
    return () => {
      alive = false;
    };
  }, []);

  async function start() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    // Clear any half-finished setups first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of (existing?.all ?? []).filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toLocaleDateString()}` });
    setBusy(false);
    if (error || !data) return setError(error?.message ?? "Could not start setup");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enroll) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) return setError("That code did not work. Check the time on your phone and try again.");
    setEnroll(null);
    setCode("");
    await load();
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Turn off two-factor authentication for this app?")) return;
    const { error } = await createClient().auth.mfa.unenroll({ factorId: id });
    if (error) return setError(error.message);
    await load();
    router.refresh();
  }

  if (factors === null) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {factors.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="size-2 rounded-full bg-success" />
              <span className="flex-1">{f.friendly_name || "Authenticator app"}</span>
              <button className="text-xs text-muted hover:text-danger" onClick={() => remove(f.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Not set up. Add an authenticator app (Google Authenticator, 1Password, Authy and others) for a second step at sign-in.</p>
      )}

      {enroll ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <p>Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code for your authenticator app" className="size-44 rounded bg-white p-2" />
          <p className="text-xs text-muted">
            Can&apos;t scan? Enter this key: <code className="break-all">{enroll.secret}</code>
          </p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} className="w-32" />
            <Button onClick={verify} disabled={busy || code.trim().length !== 6}>
              Verify
            </Button>
          </div>
        </div>
      ) : (
        factors.length === 0 && (
          <div>
            <Button onClick={start} disabled={busy}>
              Set up authenticator app
            </Button>
          </div>
        )
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
