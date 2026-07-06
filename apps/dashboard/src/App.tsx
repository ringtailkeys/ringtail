import type { DaemonSnapshot } from "@ringtail/core";
import {
  ActionsPanel,
  Badge,
  Button,
  ChatPanel,
  allKeyframes,
  cssVars,
  font,
  moonlit,
  radius,
} from "@ringtail/ui";
import { Fragment, useEffect, useState } from "react";
import roccoChill from "../../.brand-assets/rocco-chill.png";
import { AgentPicker } from "./cockpit/AgentPicker";
import { ChooseProject } from "./cockpit/ChooseProject";
import { LiveGrid } from "./cockpit/LiveGrid";
import { RootIntake } from "./cockpit/RootIntake";
import { WizardModal } from "./cockpit/WizardModal";
import {
  approveAction,
  fixtureSnapshot,
  sendChat,
  setAgent,
  setProject,
  submitStep,
  subscribeLive,
} from "./live";

/**
 * The LOCAL cockpit — wired LIVE, now with a clear 3-step on-ramp (progressive
 * disclosure, one decision per screen): ① connect your coding agent → ② choose the
 * local project → ③ the cockpit. The step is GATED on daemon state (agent → project),
 * so a reload restores the right screen off the primed SSE snapshot. It subscribes to
 * the daemon's SSE state stream (ONE source of truth) and re-renders on every push as
 * the agent drives over MCP. Daemon down → fixtures render the cockpit directly (so
 * Storybook + offline still paint). ZERO TELEMETRY: one network target, the local daemon.
 */
export function App() {
  const [snapshot, setSnapshot] = useState<DaemonSnapshot>(fixtureSnapshot);
  const [live, setLive] = useState(false);

  useEffect(() => {
    return subscribeLive(
      (snap) => {
        setSnapshot(snap);
        setLive(true);
      },
      () => setLive(false),
    );
  }, []);

  // The onboarding gate. Offline → straight to the cockpit with fixtures (the board
  // still renders). Live → no-agent = step 1, agent-but-no-project = step 2, both = 3.
  const step: 1 | 2 | 3 = !live ? 3 : !snapshot.agent ? 1 : !snapshot.project ? 2 : 3;

  return (
    <>
      <style>{cssVars(moonlit)}</style>
      <style>{allKeyframes}</style>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--ink)",
          fontFamily: font.ui,
          padding: "clamp(24px, 5vw, 64px)",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <Header live={live} />
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Badge>MIT</Badge>
            <Badge tone="berry">local-first</Badge>
            <Badge tone="amber">no telemetry</Badge>
          </div>

          {live && <Stepper step={step} />}

          {step === 1 && <ConnectStep onConnect={(id) => void setAgent(id)} />}

          {step === 2 && (
            <ChooseProject
              agentName={snapshot.agent?.name}
              onChoose={(path) => void setProject(path)}
              onBack={() => void setAgent(null)}
            />
          )}

          {step === 3 && (
            <Cockpit
              snapshot={snapshot}
              live={live}
              onSwitchProject={() => void setProject(null)}
              onSwitchAgent={() => void setAgent(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}

// Step 1 — a clean, centered, single-purpose screen: the agent picker (with its own
// "loopback session token — never a secret value" explainer) + the persistent trust pill.
function ConnectStep({ onConnect }: { onConnect: (id: string) => void }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <AgentPicker onConnect={onConnect} />
      <div style={{ textAlign: "center" }}>
        <TrustIndicator />
      </div>
    </div>
  );
}

// Step 3 — the existing cockpit, scoped to the active project: the 4-col grid + the
// NEXT ACTIONS panel + TALK TO THE AGENT chat, with a bar showing the active project
// and a way to switch project/agent (back).
function Cockpit({
  snapshot,
  live,
  onSwitchProject,
  onSwitchAgent,
}: {
  snapshot: DaemonSnapshot;
  live: boolean;
  onSwitchProject: () => void;
  onSwitchAgent: () => void;
}) {
  return (
    <>
      {live && snapshot.project && (
        <ProjectBar
          projectName={snapshot.project.name}
          projectPath={snapshot.project.path}
          agentName={snapshot.agent?.name}
          onSwitchProject={onSwitchProject}
          onSwitchAgent={onSwitchAgent}
        />
      )}
      {live && <RootIntake live={live} />}
      <LiveGrid grid={snapshot.grid} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          marginTop: 28,
          alignItems: "start",
        }}
      >
        <ActionsPanel
          actions={snapshot.actions}
          onApprove={live ? (id, confirmed) => void approveAction(id, confirmed) : undefined}
        />
        <ChatPanel messages={snapshot.chat} onSend={live ? sendChat : undefined} disabled={!live} />
      </div>
      {snapshot.wizard && (
        <WizardModal wizard={snapshot.wizard} onSubmit={live ? submitStep : undefined} />
      )}
    </>
  );
}

function ProjectBar({
  projectName,
  projectPath,
  agentName,
  onSwitchProject,
  onSwitchAgent,
}: {
  projectName: string;
  projectPath: string;
  agentName?: string;
  onSwitchProject: () => void;
  onSwitchAgent: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        border: "1px solid var(--line)",
        borderRadius: radius.md,
        padding: "10px 14px",
        marginBottom: 20,
      }}
    >
      <Badge tone="berry">project</Badge>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: font.ui, fontWeight: 600 }}>{projectName}</div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: "var(--ink-soft)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {projectPath}
          {agentName ? ` · ${agentName}` : ""}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onSwitchProject}>
        switch project
      </Button>
      <Button variant="ghost" size="sm" onClick={onSwitchAgent}>
        switch agent
      </Button>
    </div>
  );
}

// The breadcrumb: ① Connect agent → ② Project → ③ Cockpit. Done steps check off,
// the current one is lit green, upcoming ones stay muted — the on-ramp made legible.
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, mark: "①", label: "Connect agent" },
    { n: 2, mark: "②", label: "Project" },
    { n: 3, mark: "③", label: "Cockpit" },
  ] as const;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "0 0 24px",
        flexWrap: "wrap",
      }}
    >
      {items.map((s, i) => {
        const state = s.n < step ? "done" : s.n === step ? "current" : "upcoming";
        const lit = state !== "upcoming";
        return (
          <Fragment key={s.n}>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                letterSpacing: "0.04em",
                padding: "6px 12px",
                borderRadius: radius.pill,
                border: `1px solid ${lit ? "color-mix(in srgb, var(--green) 40%, var(--line))" : "var(--line)"}`,
                background:
                  state === "current"
                    ? "color-mix(in srgb, var(--green) 10%, transparent)"
                    : "transparent",
                color: lit ? "var(--green)" : "var(--ink-soft)",
                whiteSpace: "nowrap",
              }}
            >
              {state === "done" ? "✓" : s.mark} {s.label}
            </span>
            {i < items.length - 1 && <span style={{ color: "var(--ink-soft)" }}>→</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

function Header({ live }: { live: boolean }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
      <img
        src={roccoChill}
        alt="Rocco, the Ringtail bandit"
        width={72}
        height={72}
        style={{ borderRadius: radius.md }}
      />
      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontFamily: font.display,
            fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          ringtail
        </h1>
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
            margin: "4px 0 0",
          }}
        >
          your keys, raided · washed · stashed
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <StatusPill live={live} />
        <TrustIndicator />
      </div>
    </header>
  );
}

// Persistent, always-on (independent of daemon state): the guarantee never disappears,
// with Rocco's line as the tasteful undertone. This is the header trust anchor.
function TrustIndicator() {
  return (
    <span
      title='"your keys. my paws only." — Rocco'
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        letterSpacing: "0.04em",
        padding: "6px 12px",
        borderRadius: radius.pill,
        border: "1px solid color-mix(in srgb, var(--green) 40%, var(--line))",
        background: "color-mix(in srgb, var(--green) 10%, transparent)",
        color: "var(--green)",
        whiteSpace: "nowrap",
      }}
    >
      🔒 agent never sees your secrets
    </span>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        letterSpacing: "0.06em",
        padding: "6px 12px",
        borderRadius: radius.pill,
        border: `1px solid var(--line)`,
        color: live ? "var(--green)" : "var(--ink-soft)",
        whiteSpace: "nowrap",
      }}
    >
      {live ? "● daemon live" : "○ daemon offline — showing fixtures"}
    </span>
  );
}
