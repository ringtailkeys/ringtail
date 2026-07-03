import {
  Button,
  Card,
  type CredentialStatus,
  Eyebrow,
  Rocco,
  type RoccoPose,
  StatusChip,
  allKeyframes,
  font,
} from "@ringtail/ui";
import { useEffect, useState } from "react";
import { ENVS, type Env } from "./fixtures";

/**
 * The provision sequence — the whole state machine made visible: acquire →
 * validate → provision → sync, with Rocco reacting (working → success → chill/
 * snoozing) and the dev/staging/prod cells flipping ✓ one-by-one (the "sort").
 * Deadpan mono status lines in Rocco's voice. No daemon — pure timer walk.
 */

interface Frame {
  pose: RoccoPose;
  line: string;
  cells: Record<Env, CredentialStatus>;
}

const cells = (
  dev: CredentialStatus,
  staging: CredentialStatus,
  prod: CredentialStatus,
): Record<Env, CredentialStatus> => ({
  dev,
  staging,
  prod,
});

const FRAMES: Frame[] = [
  {
    pose: "chill",
    line: "$ npx ringtail raid cloudflare",
    cells: cells("missing", "missing", "missing"),
  },
  {
    pose: "working",
    line: "acquire — head's in the dumpster, raiding the token page…",
    cells: cells("needs-consent", "needs-consent", "needs-consent"),
  },
  {
    pose: "working",
    line: "validate — holding it to the moonlight…",
    cells: cells("validating", "validating", "validating"),
  },
  {
    pose: "success",
    line: "scope validated ✓ — that one's good",
    cells: cells("validated", "validated", "validated"),
  },
  {
    pose: "working",
    line: "provision — dealing dev · staging · prod, everybody gets a pocket…",
    cells: cells("provisioning", "provisioning", "provisioning"),
  },
  {
    pose: "working",
    line: "sync — dev pocket ✓",
    cells: cells("synced", "provisioning", "provisioning"),
  },
  {
    pose: "working",
    line: "sync — staging pocket ✓",
    cells: cells("synced", "synced", "provisioning"),
  },
  {
    pose: "success",
    line: "✓ wrote .env.local + Infisical (dev · staging · prod)",
    cells: cells("synced", "synced", "synced"),
  },
  {
    pose: "chill",
    line: "all stashed and synced. i'll nap on the hoard. wake me on the next key.",
    cells: cells("synced", "synced", "synced"),
  },
];

export function ProvisionSequence() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (step >= FRAMES.length - 1) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 950);
    return () => clearTimeout(t);
  }, [running, step]);

  const frame = FRAMES[step] ?? FRAMES[0];
  if (!frame) return null;

  const start = () => {
    setStep(0);
    setRunning(true);
  };

  return (
    <>
      <style>{allKeyframes}</style>
      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
          <Rocco pose={frame.pose} size={88} />
          <div style={{ flex: 1 }}>
            <Eyebrow>cloudflare · the raid</Eyebrow>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 13,
                color: "var(--ink)",
                marginTop: 6,
                minHeight: 40,
                lineHeight: 1.5,
              }}
            >
              {frame.line}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {ENVS.map((e) => (
            <div
              key={e}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: 12,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ink-soft)",
                  marginBottom: 8,
                }}
              >
                {e}
              </div>
              <StatusChip key={frame.cells[e]} status={frame.cells[e]} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button onClick={start} disabled={running}>
            {running
              ? "raiding…"
              : step >= FRAMES.length - 1
                ? "run the raid again"
                : "run the raid"}
          </Button>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
            step {step + 1}/{FRAMES.length}
          </span>
        </div>
      </Card>
    </>
  );
}
