import type { DaemonSnapshot } from "@ringtail/core";
import {
  ActionsPanel,
  Badge,
  ChatPanel,
  allKeyframes,
  cssVars,
  font,
  moonlit,
  radius,
} from "@ringtail/ui";
import { useEffect, useState } from "react";
import roccoChill from "../../.brand-assets/rocco-chill.png";
import { AgentPicker } from "./cockpit/AgentPicker";
import { LiveGrid } from "./cockpit/LiveGrid";
import { WizardModal } from "./cockpit/WizardModal";
import { approveAction, fixtureSnapshot, sendChat, submitStep, subscribeLive } from "./live";

/**
 * The LOCAL cockpit — now wired LIVE. It subscribes to the daemon's SSE state
 * stream (grid + current wizard, ONE source of truth) and re-renders on every push
 * as the agent drives over MCP: cells flip green, wizard steps check off. If the
 * daemon is down it falls back to fixtures so the cockpit (and Storybook) still
 * renders. ZERO TELEMETRY: one network target, the local daemon. Nothing phones home.
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
          {live && <AgentPicker />}
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
            <ChatPanel
              messages={snapshot.chat}
              onSend={live ? sendChat : undefined}
              disabled={!live}
            />
          </div>
        </div>
      </div>
      {snapshot.wizard && (
        <WizardModal wizard={snapshot.wizard} onSubmit={live ? submitStep : undefined} />
      )}
    </>
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
