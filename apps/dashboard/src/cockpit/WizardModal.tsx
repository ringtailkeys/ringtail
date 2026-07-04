import type { Step, Wizard } from "@ringtail/core";
import { Button, Eyebrow, Modal, StatusDot, font } from "@ringtail/ui";

/**
 * The UNIVERSAL wizard renderer — one component paints any agent-authored Wizard.
 * Each Step renders by `kind` (architecture.md §"Step kinds"):
 *   open-url → a deep-link · paste → an input with the trust affordance · auto →
 *   a progress row · confirm → a button. Per-step `status` reflects live as the
 *   daemon streams check-offs. "Ringtail owns every pixel" — the agent fills slots.
 *
 * THE TRUST LINCHPIN: a `paste` input shows "🔒 goes to Ringtail, not the agent."
 * ponytail: the input is presentational in P2 — the driver simulates submitStep;
 * wiring the browser POST is P2.5. The affordance is the load-bearing part.
 */

const STEP_STATE: Record<
  Step["status"],
  { dot: "validating" | "synced" | "wrong-scope" | "missing"; label: string }
> = {
  pending: { dot: "missing", label: "pending" },
  active: { dot: "validating", label: "in progress" },
  done: { dot: "synced", label: "done" },
  failed: { dot: "wrong-scope", label: "failed" },
};

export function WizardModal({ wizard, onClose }: { wizard: Wizard; onClose?: () => void }) {
  return (
    <Modal open title={wizard.title} onClose={onClose}>
      {wizard.provider && <Eyebrow>{wizard.provider} · the raid</Eyebrow>}
      <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 12 }}>
        {wizard.steps.map((step, i) => (
          <li
            key={step.id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              padding: 14,
              opacity: step.status === "pending" ? 0.7 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <StatusDot status={STEP_STATE[step.status].dot} />
              <span style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--ink)" }}>
                {i + 1}. {step.title}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: "var(--ink-soft)",
                }}
              >
                {STEP_STATE[step.status].label}
              </span>
            </div>
            {step.description && (
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  margin: "0 0 10px",
                }}
              >
                {step.description}
              </p>
            )}
            <StepBody step={step} />
          </li>
        ))}
      </ol>
    </Modal>
  );
}

function StepBody({ step }: { step: Step }) {
  switch (step.kind) {
    case "open-url":
      return (
        <div>
          <a
            href={step.payload?.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: font.mono, fontSize: 13, color: "var(--amber-deep)" }}
          >
            {step.payload?.url ?? "open link"} ↗
          </a>
          {step.payload?.scopes?.length ? (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: "var(--ink-soft)",
                marginTop: 6,
              }}
            >
              scopes: {step.payload.scopes.join(" · ")}
            </div>
          ) : null}
        </div>
      );
    case "paste":
      return (
        <div>
          <input
            type="password"
            placeholder={step.payload?.varName ?? "paste value"}
            disabled
            style={{
              width: "100%",
              padding: "8px 10px",
              fontFamily: font.mono,
              fontSize: 13,
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
            }}
          />
          <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)", marginTop: 6 }}>
            🔒 goes to Ringtail, not the agent
          </div>
        </div>
      );
    case "auto":
      return (
        <div style={{ fontFamily: font.mono, fontSize: 12, color: "var(--berry)" }}>
          ◇ Ringtail runs this automatically — no human needed.
        </div>
      );
    case "confirm":
      return (
        <Button variant={step.danger === "destructive" ? "ghost" : "primary"} disabled>
          {step.danger === "destructive" ? "confirm (destructive)" : "approve"}
        </Button>
      );
    default:
      return null;
  }
}
