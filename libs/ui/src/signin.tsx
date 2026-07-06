import { useState } from "react";
import { Button } from "./button";
import { Eyebrow } from "./card";
import { Rocco, roccoLine } from "./rocco";
import { font, radius } from "./tokens";

/**
 * The sign-in GATE — the FIRST screen, before the ①②③ on-ramp. Ringtail ships no auth
 * of its own; this card drives a passwordless email-OTP sign-in against the hosted
 * control-plane (through the local daemon, which holds the session). Two phases: enter
 * email → the code is emailed → paste the 6-digit code. Pure + callback-driven so the
 * same card gates the browser `ringtail up` flow AND the native app.
 *
 * THE GUARANTEE still holds here: only an email + a one-time code ever leave — never a
 * secret value. The trust line stays visible so the promise never disappears.
 */
export function SignInCard({
  onSendCode,
  onVerify,
  /** Storybook/tests: force a phase without wiring the network. */
  initialPhase = "email",
}: {
  onSendCode: (email: string) => Promise<void>;
  onVerify: (email: string, otp: string) => Promise<void>;
  initialPhase?: "email" | "code";
}) {
  const [phase, setPhase] = useState<"email" | "code">(initialPhase);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSendCode(email.trim());
      setPhase("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not send the code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!otp.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(email.trim(), otp.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "that code didn't work");
      setBusy(false); // stay on the code screen to retry (success unmounts the gate)
    }
  }

  const inputStyle = {
    fontFamily: font.mono,
    fontSize: 14,
    padding: "10px 12px",
    width: "100%",
    boxSizing: "border-box" as const,
    background: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: radius.sm,
    outline: "none",
  };

  return (
    <section style={{ maxWidth: 420, margin: "0 auto" }}>
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}
      >
        <Rocco pose="waving" animated size={128} />
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: "var(--ink-soft)",
            textAlign: "center",
            margin: "6px 0 0",
          }}
        >
          “{roccoLine("waving")}”
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: radius.md,
          padding: 20,
          background: "var(--bg)",
        }}
      >
        <Eyebrow>{phase === "email" ? "sign in to raid" : "check your inbox"}</Eyebrow>
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 14px" }}>
          {phase === "email"
            ? "One account gates the raid — no password, just a code by email. Your keys never leave your machine."
            : `We emailed a 6-digit code to ${email}. Paste it below.`}
        </p>

        {phase === "email" ? (
          <input
            type="email"
            inputMode="email"
            autoFocus
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            style={inputStyle}
          />
        ) : (
          <input
            inputMode="numeric"
            autoFocus
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && void verify()}
            style={{ ...inputStyle, letterSpacing: "0.4em", textAlign: "center", fontSize: 20 }}
          />
        )}

        {error && (
          <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--danger, #E08A6B)", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
          {phase === "code" && (
            <Button variant="ghost" onClick={() => setPhase("email")} disabled={busy}>
              ← back
            </Button>
          )}
          {phase === "email" ? (
            <Button onClick={() => void send()} disabled={busy || !email.trim()}>
              {busy ? "sending…" : "email me a code →"}
            </Button>
          ) : (
            <Button onClick={() => void verify()} disabled={busy || otp.length < 6}>
              {busy ? "verifying…" : "sign in →"}
            </Button>
          )}
        </div>
      </div>

      <p
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: "var(--ink-soft)",
          textAlign: "center",
          margin: "14px 0 0",
        }}
      >
        🔒 agent never sees your secrets · MIT · local-first
      </p>
    </section>
  );
}
