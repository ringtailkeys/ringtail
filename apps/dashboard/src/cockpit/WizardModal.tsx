import type { Step, Wizard } from "@ringtail/core";
import { Button, Eyebrow, Modal, StatusDot, font } from "@ringtail/ui";
import { useState } from "react";

/**
 * The UNIVERSAL wizard renderer — one component paints any agent-authored Wizard.
 * Each Step renders by `kind` (architecture.md §"Step kinds"):
 *   open-url → a deep-link · paste → an input with the trust affordance · auto →
 *   a progress row · confirm → a button. Per-step `status` reflects live as the
 *   daemon streams check-offs. "Ringtail owns every pixel" — the agent fills slots.
 *
 * THE TRUST LINCHPIN: a `paste` input shows "🔒 goes to Ringtail, not the agent."
 * When `onSubmit` is supplied (the live cockpit) the paste value POSTs user →
 * daemon → @ringtail/store, NEVER through the agent. Without it (Storybook) the
 * input stays presentational. The affordance is always shown.
 */

type SubmitFn = (stepId: string, value: string) => Promise<unknown>;

const STEP_STATE: Record<
  Step["status"],
  { dot: "validating" | "synced" | "wrong-scope" | "missing"; label: string }
> = {
  pending: { dot: "missing", label: "pending" },
  active: { dot: "validating", label: "in progress" },
  done: { dot: "synced", label: "done" },
  failed: { dot: "wrong-scope", label: "failed" },
};

export function WizardModal({
  wizard,
  onClose,
  onSubmit,
}: {
  wizard: Wizard;
  onClose?: () => void;
  onSubmit?: SubmitFn;
}) {
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
            <StepBody step={step} onSubmit={onSubmit} />
          </li>
        ))}
      </ol>
    </Modal>
  );
}

function PasteStep({ step, onSubmit }: { step: Step; onSubmit?: SubmitFn }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const done = step.status === "done";
  const live = Boolean(onSubmit) && !done;

  async function submit() {
    if (!onSubmit || !value) return;
    setBusy(true);
    try {
      // The value leaves the browser ONLY here — straight to the daemon. It never
      // touches the agent, and we drop it from state right after the POST.
      await onSubmit(step.id, value);
      setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        type="password"
        placeholder={step.payload?.varName ?? "paste value"}
        value={value}
        disabled={!live || busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 6,
        }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)" }}>
          🔒 goes to Ringtail, not the agent
        </span>
        {live && (
          <Button variant="primary" disabled={!value || busy} onClick={() => void submit()}>
            {busy ? "sending…" : "submit"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepBody({ step, onSubmit }: { step: Step; onSubmit?: SubmitFn }) {
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
      return <PasteStep step={step} onSubmit={onSubmit} />;
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
