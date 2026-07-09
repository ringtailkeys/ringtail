import { Badge, Button, Card, Eyebrow, Rocco, font, radius } from "@ringtail/ui";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { type ConnectStatus, connectStart, fetchConnectStatus, submitRoot } from "../live";
import { VendorLogo, VendorPicker } from "./VendorPicker";
import { type Vendor, customVendor, findVendor } from "./vendors";

/**
 * The connect surface (PRD §4.8 + §4.9) — the ONE human moment. Progressive disclosure: pick
 * a provider, then see a SMALL card with exactly ONE obvious next step, everything else one
 * subtle click away. No wall of text (the previous pass overcorrected into a mess).
 *
 *   • OAuth-ready provider          → a single "Connect … with OAuth" button. That's it.
 *   • Everyone else (Creem, Resend, → a single-row paste (label/account hidden behind
 *     custom vendors)                 an "add a label" toggle).
 *   • Don't have a key yet?         → one subtle line that expands to the agent-guided
 *                                      signup (buttons + copy-prompt), collapsed by default.
 *
 * Value-free by construction: picker/status/roots carry ids · labels · scopes · expiry only.
 * THE GUARANTEE holds — the one secret input posts direct to the daemon vault, is dropped from
 * state right after the POST, and is NEVER rendered back.
 */
export function ConnectPanel({
  live,
  agentName,
  statusSeed,
}: {
  live?: boolean;
  /** The connected coding agent's name (snapshot.agent) — personalises the agent-guide prompt. */
  agentName?: string;
  /** Pre-seeded connect status (Storybook/e2e) — exercise the OAuth needs-creds /
   * already-connected / root-held branches without a live daemon. */
  statusSeed?: ConnectStatus;
}) {
  // The active selection is a full Vendor (so a free-typed CUSTOM vendor works too), not
  // just a canonical id — the root-cause fix for the closed-list dead-end.
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [status, setStatus] = useState<ConnectStatus>(
    statusSeed ?? { connected: [], connectors: [] },
  );

  const connected = vendor
    ? (status.connected.find((c) => c.provider === vendor.id) ?? null)
    : null;
  const connector = vendor ? (status.connectors.find((c) => c.id === vendor.id) ?? null) : null;
  const storedRoots = vendor ? (status.roots?.filter((r) => r.provider === vendor.id) ?? []) : [];
  const hasRoot = storedRoots.length > 0;
  const needsCreds = connector?.needsClientCreds ?? false;
  const oauthReady = Boolean(vendor?.oauth) && !connected && !needsCreds;

  const refresh = useMemo(
    () => () => {
      if (live) void fetchConnectStatus().then(setStatus);
    },
    [live],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Card style={{ marginBottom: 20, overflow: "visible" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Rocco pose="waving" size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eyebrow>connect a provider · the one human moment</Eyebrow>
            {/* The roots-vs-minted mental model, once, behind a subtle "?" — not a wall on every pick. */}
            <span
              title="roots — per-provider, machine-global (add once, reused everywhere) · minted keys — per-project / per-env (the grid's LOCAL · DEV · STAGING · PROD)"
              style={{
                cursor: "help",
                fontFamily: font.mono,
                fontSize: 11,
                color: "var(--ink-soft)",
                border: "1px solid var(--line)",
                borderRadius: radius.pill,
                width: 16,
                height: 16,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ?
            </span>
          </div>
          <div style={{ maxWidth: 460, marginTop: 8 }}>
            <VendorPicker
              value={vendor && !vendor.custom ? vendor.id : null}
              selectedLabel={vendor?.label}
              onPick={(id) => setVendor(findVendor(id))}
              onCustom={(q) => setVendor(customVendor(q))}
            />
          </div>

          {vendor && (
            <div style={pickedCard}>
              {/* One-line vendor header. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <VendorLogo id={vendor.id} size={22} />
                <span style={{ fontFamily: font.ui, fontWeight: 600 }}>{vendor.label}</span>
                <span style={{ ...mono11, color: "var(--ink-soft)" }}>· {vendor.category}</span>
                {vendor.custom && <Badge tone="amber">custom</Badge>}
                {connected && <Pill>✓ connected</Pill>}
                {!connected && hasRoot && <Pill>✓ root stored</Pill>}
              </div>

              {/* Exactly ONE primary action. */}
              <div style={{ marginTop: 12 }}>
                {connected ? (
                  <span style={{ ...mono11, color: "var(--green)" }}>
                    ✓ {vendor.label} connected
                    {connected.scopes.length ? ` · ${connected.scopes.join(", ")}` : ""}
                    {connected.expiresAt
                      ? ` · expires ${new Date(connected.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                ) : oauthReady ? (
                  <OAuthConnect
                    provider={vendor.id}
                    label={vendor.label}
                    live={Boolean(live)}
                    onPoll={refresh}
                  />
                ) : (
                  <PasteRow
                    provider={vendor.id}
                    label={vendor.label}
                    live={Boolean(live)}
                    varSeed={vendor.custom ? vendor.defaultVar : undefined}
                    onStored={refresh}
                  />
                )}
              </div>

              {/* Subtle escape hatch: OAuth exists but needs a one-time daemon setup. */}
              {vendor.oauth && needsCreds && !connected && (
                <Disclose summary="OAuth available with a one-time setup — how to enable →">
                  <p style={{ ...mono11, color: "var(--ink-soft)", margin: 0 }}>
                    Register an OAuth app with {vendor.label} and set{" "}
                    <code>RINGTAIL_OAUTH_{vendor.id.toUpperCase()}_CLIENT_ID</code> (and secret, if
                    required) in the daemon's environment, then restart <code>ringtail up</code>.
                  </p>
                </Disclose>
              )}

              {/* Subtle escape hatch: don't have a key yet — the agent walks you there. */}
              {!connected && (
                <Disclose summary="Don't have a key yet? Let your agent walk you there →">
                  <AgentGuided vendor={vendor} connector={connector} agentName={agentName} />
                </Disclose>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// A green "held" pill (green is SACRED — not a Badge tone — so it's built inline).
function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        ...mono11,
        color: "var(--green)",
        border: "1px solid color-mix(in srgb, var(--green) 40%, var(--line))",
        borderRadius: radius.pill,
        padding: "2px 8px",
      }}
    >
      {children}
    </span>
  );
}

// A collapsed secondary line that expands in place — the whole progressive-disclosure trick.
function Disclose({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...mono11,
          color: "var(--ink-soft)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {summary}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

// ── the ONE primary: OAuth ────────────────────────────────────────────────────
function OAuthConnect({
  provider,
  label,
  live,
  onPoll,
}: {
  provider: string;
  label: string;
  live: boolean;
  onPoll: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  async function connect() {
    if (!live) return;
    setBusy(true);
    setErr(null);
    try {
      const { authorizeUrl } = await connectStart(provider);
      window.open(authorizeUrl, "_blank", "noopener");
      // Poll the value-free status while the user completes the flow in the other tab.
      setWaiting(true);
      const id = setInterval(onPoll, 2000);
      setTimeout(() => clearInterval(id), 90_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="primary" disabled={!live || busy} onClick={() => void connect()}>
        {busy
          ? "starting…"
          : waiting
            ? "waiting for authorization…"
            : `Connect ${label} with OAuth`}
      </Button>
      <div style={{ ...mono11, color: "var(--ink-soft)", marginTop: 6 }}>
        {waiting
          ? "approve in the tab that opened — this updates when the grant lands"
          : "one click · never a key"}
      </div>
      {err && <p style={{ ...mono11, color: "var(--amber-deep)" }}>{err}</p>}
    </div>
  );
}

// ── the ONE primary: paste a key (single row; label/account behind a toggle) ──────
function PasteRow({
  provider,
  label,
  live,
  varSeed,
  onStored,
}: {
  provider: string;
  label: string;
  live: boolean;
  /** For a CUSTOM vendor: an editable env-var name (seeded, stored as the root label). */
  varSeed?: string;
  onStored: () => void;
}) {
  const [rootLabel, setRootLabel] = useState("");
  const [account, setAccount] = useState("");
  const [varName, setVarName] = useState(varSeed ?? "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLabel, setShowLabel] = useState(false);

  // Re-seed the var name when the selected custom vendor changes.
  useEffect(() => setVarName(varSeed ?? ""), [varSeed]);

  async function submit() {
    if (!live || !value) return;
    setBusy(true);
    try {
      // The value leaves the browser ONLY here — straight to the daemon vault, never the
      // agent — and we drop it from state right after the POST.
      await submitRoot(provider, value, {
        label: (varSeed ? varName.trim() || varSeed : rootLabel.trim()) || undefined,
        account: account.trim() || undefined,
      });
      setValue("");
      setRootLabel("");
      setAccount("");
      onStored();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          placeholder={`paste your ${label} API key`}
          value={value}
          disabled={!live || busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          style={{ ...inputStyle, flex: 1 }}
          aria-label={`paste your ${label} API key`}
        />
        <Button variant="primary" disabled={!live || !value || busy} onClick={() => void submit()}>
          {busy ? "storing…" : "Store"}
        </Button>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 8,
        }}
      >
        <span style={{ ...mono11, color: "var(--green)" }}>
          🔒 goes to Ringtail, never the agent
        </span>
        <button
          type="button"
          onClick={() => setShowLabel((v) => !v)}
          style={{
            ...mono11,
            color: "var(--ink-soft)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {showLabel ? "hide label" : "add a label"}
        </button>
      </div>
      {showLabel && (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
          {varSeed ? (
            <input
              placeholder="env var name"
              value={varName}
              disabled={!live || busy}
              onChange={(e) => setVarName(e.target.value)}
              style={inputStyle}
              aria-label="env var name"
            />
          ) : (
            <input
              placeholder="label (e.g. prod)"
              value={rootLabel}
              disabled={!live || busy}
              onChange={(e) => setRootLabel(e.target.value)}
              style={inputStyle}
              aria-label="root label"
            />
          )}
          <input
            placeholder="account (optional)"
            value={account}
            disabled={!live || busy}
            onChange={(e) => setAccount(e.target.value)}
            style={inputStyle}
            aria-label="account"
          />
        </div>
      )}
    </div>
  );
}

// ── the collapsed agent-guided signup (buttons + a copy-able agent prompt) ────────
function AgentGuided({
  vendor,
  connector,
  agentName,
}: {
  vendor: Vendor;
  connector: ConnectStatus["connectors"][number] | null;
  agentName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(`${vendor.label} API key sign up`)}`;
  const signupUrl = connector?.signupUrl ?? searchUrl;
  const apiKeysUrl = connector?.apiKeysUrl ?? searchUrl;
  const prompt = `Help me connect ${vendor.label} to Ringtail — walk me to its API-keys page and tell me exactly where to create a key. I'll paste it into Ringtail myself (you never see the key).`;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the prompt is still selectable below.
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.open(signupUrl, "_blank", "noopener")}
        >
          {connector?.signupUrl ? "sign up ↗" : `find ${vendor.label} ↗`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(apiKeysUrl, "_blank", "noopener")}
        >
          manage keys ↗
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copyPrompt()}>
          {copied ? "copied ✓" : "copy agent prompt"}
        </Button>
      </div>
      <p style={{ ...mono11, color: "var(--ink-soft)", marginTop: 8, fontStyle: "italic" }}>
        {agentName ? `${agentName}: ` : ""}“{prompt}”
      </p>
    </div>
  );
}

const mono11: CSSProperties = { fontFamily: font.mono, fontSize: 11 };
const pickedCard: CSSProperties = {
  marginTop: 14,
  border: "1px solid var(--line)",
  borderRadius: radius.md,
  padding: "12px 14px",
};
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontFamily: font.mono,
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: radius.sm,
};
