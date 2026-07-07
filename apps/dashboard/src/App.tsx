import type { DaemonSnapshot } from "@ringtail/core";
import {
  AccountView,
  ActionsPanel,
  Badge,
  Button,
  ChatPanel,
  Reveal,
  Rocco,
  SignInCard,
  UpgradeModal,
  allKeyframes,
  cssVars,
  font,
  moonlit,
  radius,
  roccoLine,
} from "@ringtail/ui";
import { Fragment, useEffect, useState } from "react";
import { AgentPicker } from "./cockpit/AgentPicker";
import { ChooseProject } from "./cockpit/ChooseProject";
import { LiveGrid } from "./cockpit/LiveGrid";
import { RootIntake } from "./cockpit/RootIntake";
import { WizardModal } from "./cockpit/WizardModal";
import {
  approveAction,
  checkout,
  fixtureSnapshot,
  openBillingPortal,
  refreshEntitlement,
  sendChat,
  setAgent,
  setProject,
  signIn,
  signOut,
  submitStep,
  subscribeLive,
  verifyOtp,
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
  // Three-state connection: "connecting" (first paint on every `up`) → "live" on the
  // first SSE snapshot, or "down" if we NEVER reached the daemon. Fixtures render ONLY
  // in "down" (daemon-not-running / Storybook), never during the initial connect race.
  const [conn, setConn] = useState<"connecting" | "live" | "down">("connecting");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  useEffect(() => {
    return subscribeLive(
      (snap) => {
        setSnapshot(snap);
        setConn("live");
      },
      // onDown: only fall to fixtures if we NEVER connected. A post-live SSE blip
      // (EventSource auto-reconnects) must NOT regress a live session to fixtures —
      // keep the last live snapshot; the next snapshot re-confirms "live".
      () => setConn((c) => (c === "connecting" ? "down" : c)),
    );
  }, []);

  const live = conn === "live";

  // The paywall (sign-in wall + freemium + upgrade) lives ONLY in the native app edition.
  // In `oss` (`ringtail up` from source) the daemon streams edition:"oss" → the dashboard
  // renders ①②③ directly, fully ungated. The gate is a conditional layer, not a fork.
  const gated = live && snapshot.edition === "app";

  // The freemium block rides the SSE snapshot: when /api/usage returned allowed:false,
  // the daemon flags limitReached → pop the upgrade modal (the Dodo overlay). App only.
  useEffect(() => {
    if (gated && snapshot.auth.limitReached) setUpgradeOpen(true);
  }, [gated, snapshot.auth.limitReached]);

  // The gate. Offline OR oss → straight to ①②③/cockpit (no sign-in wall). App edition &
  // live: NOT-signed-in = the sign-in gate (before anything else) → no-agent = ① →
  // no-project = ② → both = ③. Sign-in comes FIRST: no ①②③ until authenticated.
  const signedIn = !gated || snapshot.auth.signedIn;
  const screen: "signin" | 1 | 2 | 3 = !live
    ? 3
    : gated && !snapshot.auth.signedIn
      ? "signin"
      : !snapshot.agent
        ? 1
        : !snapshot.project
          ? 2
          : 3;

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
          <Header
            conn={conn}
            email={gated && snapshot.auth.signedIn ? snapshot.auth.email : undefined}
            onSignOut={gated && snapshot.auth.signedIn ? () => void signOut() : undefined}
            onAccount={
              gated && snapshot.auth.signedIn ? () => setShowAccount((v) => !v) : undefined
            }
            accountActive={showAccount}
          />
          <Reveal delay={40}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Badge>MIT</Badge>
              <Badge tone="berry">local-first</Badge>
              <Badge tone="amber">no telemetry</Badge>
            </div>
          </Reveal>

          {/* Account view — app edition only, opened from the header. Presentational
              @ringtail/ui component fed off the SSE auth snapshot; onManageBilling proxies
              the daemon's /api/portal, onSignOut is the existing sign-out. */}
          {gated && snapshot.auth.signedIn && showAccount ? (
            <Reveal delay={80}>
              <AccountView
                tier={snapshot.auth.tier ?? "free"}
                email={snapshot.auth.email ?? ""}
                expiresAt={snapshot.auth.expiresAt}
                usage={snapshot.auth.usage ?? { projectsProvisioned: 0, freeLimit: 1 }}
                onManageBilling={() => void openBillingPortal()}
                onUpgrade={() => setUpgradeOpen(true)}
                onSignOut={() => void signOut()}
              />
            </Reveal>
          ) : conn === "connecting" ? (
            <Reveal key="connecting" delay={120}>
              <Connecting />
            </Reveal>
          ) : (
            <>
              {live && signedIn && typeof screen === "number" && (
                <Reveal delay={80}>
                  <Stepper step={screen} />
                </Reveal>
              )}

              {/* key on screen → the reveal spring replays on every gate transition */}
              <Reveal key={screen} delay={120}>
                {screen === "signin" && (
                  <SignInCard onSendCode={(e) => signIn(e)} onVerify={(e, o) => verifyOtp(e, o)} />
                )}

                {screen === 1 && <ConnectStep onConnect={(id) => void setAgent(id)} />}

                {screen === 2 && (
                  <ChooseProject
                    agentName={snapshot.agent?.name}
                    onChoose={(path) => void setProject(path)}
                    onBack={() => void setAgent(null)}
                  />
                )}

                {screen === 3 && (
                  <Cockpit
                    snapshot={snapshot}
                    live={live}
                    onSwitchProject={() => void setProject(null)}
                    onSwitchAgent={() => void setAgent(null)}
                  />
                )}
              </Reveal>
            </>
          )}
        </div>
      </div>

      {/* The Dodo upgrade overlay — shared @ringtail/ui component, opened on the
          server-enforced free-limit block; success re-checks entitlement → unlock. */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        onUpgraded={() => void refreshEntitlement()}
        onCheckout={checkout}
        onPollTier={refreshEntitlement}
        usage={snapshot.auth.usage}
        limitReached={snapshot.auth.limitReached}
      />
    </>
  );
}

// Step 1 — a clean, centered, single-purpose screen: the agent picker (with its own
// "loopback session token — never a secret value" explainer) + the persistent trust pill.
function ConnectStep({ onConnect }: { onConnect: (id: string) => void }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <Rocco pose="waving" animated size={128} />
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: "var(--ink-soft)",
            textAlign: "center",
            margin: 0,
          }}
        >
          “{roccoLine("waving")}”
        </p>
      </div>
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
        <Reveal delay={40}>
          <ProjectBar
            projectName={snapshot.project.name}
            projectPath={snapshot.project.path}
            agentName={snapshot.agent?.name}
            onSwitchProject={onSwitchProject}
            onSwitchAgent={onSwitchAgent}
          />
        </Reveal>
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
        <Reveal delay={140}>
          <ActionsPanel
            actions={snapshot.actions}
            onApprove={live ? (id, confirmed) => void approveAction(id, confirmed) : undefined}
          />
        </Reveal>
        <Reveal delay={200}>
          <ChatPanel
            messages={snapshot.chat}
            onSend={live ? sendChat : undefined}
            disabled={!live}
          />
        </Reveal>
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

// The initial paint on every `up`: an on-brand "connecting" state — NOT the fixture
// cockpit, and never the word "offline". Rocco waves while the SSE handshake races;
// the first snapshot flips us to "live" (screen ① agent picker). Root-cause fix: the
// old boolean `live` started false → flashed the offline fixture cockpit for ~few
// hundred ms and skipped screen ① entirely.
function Connecting() {
  return (
    <div
      style={{
        maxWidth: 620,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "48px 0",
        textAlign: "center",
      }}
    >
      <Rocco pose="waving" animated size={128} />
      <p style={{ fontFamily: font.ui, fontSize: 16, margin: 0 }}>
        Connecting to the local daemon…
      </p>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
        detecting your coding agents
      </p>
    </div>
  );
}

function Header({
  conn,
  email,
  onSignOut,
  onAccount,
  accountActive,
}: {
  conn: "connecting" | "live" | "down";
  email?: string;
  onSignOut?: () => void;
  onAccount?: () => void;
  accountActive?: boolean;
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
      <Rocco pose={conn === "live" ? "chill" : "waving"} animated size={72} />
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
        <StatusPill conn={conn} />
        <TrustIndicator />
        {onSignOut && (
          <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
            {onAccount && (
              <>
                <button
                  type="button"
                  onClick={onAccount}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    font: "inherit",
                    color: accountActive ? "var(--amber-deep)" : "var(--ink-soft)",
                    textDecoration: "underline",
                  }}
                >
                  {accountActive ? "← cockpit" : "account"}
                </button>
                {" · "}
              </>
            )}
            {email ? `${email} · ` : ""}
            <button
              type="button"
              onClick={onSignOut}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                font: "inherit",
                color: "var(--ink-soft)",
                textDecoration: "underline",
              }}
            >
              sign out
            </button>
          </span>
        )}
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

function StatusPill({ conn }: { conn: "connecting" | "live" | "down" }) {
  const label =
    conn === "live"
      ? "● daemon live"
      : conn === "connecting"
        ? "◌ connecting…"
        : "○ daemon offline — showing fixtures";
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        letterSpacing: "0.06em",
        padding: "6px 12px",
        borderRadius: radius.pill,
        border: `1px solid var(--line)`,
        color: conn === "live" ? "var(--green)" : "var(--ink-soft)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
