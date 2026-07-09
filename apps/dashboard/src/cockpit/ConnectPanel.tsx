import { Badge, Button, Card, Eyebrow, Rocco, font, radius } from "@ringtail/ui";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { type ConnectStatus, connectStart, fetchConnectStatus, submitRoot } from "../live";
import { VendorLogo, VendorPicker } from "./VendorPicker";
import { type Vendor, customVendor, findVendor } from "./vendors";

/**
 * The connect surface (PRD §4.8 + §4.9) — the ONE human moment, now vendor-driven and
 * three-moded, and (this pass) built to HOLD the user through it. Pick a provider from the
 * canonical autocomplete OR free-type any vendor (the Dodo case), then connect it:
 *
 *   (a) OAuth "Connect"  → POST /api/connect/start → open the authorizeUrl in a new tab →
 *       poll GET /api/connect/status until the grant lands → "Connected ✓ (scopes · expiry)".
 *       If the daemon has no OAuth app configured we DON'T hide it — we say so and point at
 *       paste / agent-guide.
 *   (b) Paste a named root (label + account + value) → POST /api/root. The value field is the
 *       ONLY place a secret is typed; it goes straight to the daemon and is dropped from state
 *       right after the POST — NEVER rendered back.
 *   (c) Agent-guided signup — real BUTTONS that open the provider's signup / manage-keys page
 *       and hand a connected agent a ready copy-able prompt to walk you to the key.
 *
 * Holding the user: a legend (roots are per-provider machine-global; minted keys are
 * per-project/per-env — the grid's LOCAL·DEV·STAGING·PROD), a clear CONFIRM when a provider
 * already holds a root, and an explicit next-step after a root lands / a provider connects.
 *
 * Value-free by construction: the picker/status/roots surfaces carry ids · labels · scopes ·
 * expiry only. THE GUARANTEE (agent never sees a value) holds — the one secret input posts
 * direct to the daemon vault, never through the agent, never echoed.
 */
export function ConnectPanel({
  live,
  agentName,
  statusSeed,
}: {
  live?: boolean;
  /** The connected coding agent's name (snapshot.agent) — enables the "hand your agent a
   * prompt" affordance in the agent-guided mode. Absent → the copy-prompt still renders. */
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
  const held = Boolean(connected) || hasRoot;

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
          <Eyebrow>connect a provider · the one human moment</Eyebrow>
          <p style={helpText}>
            Search a provider (or type any vendor), then connect it: <strong>OAuth</strong> (one
            click), <strong>paste a root key</strong> (goes straight to Ringtail), or let the{" "}
            <strong>agent guide</strong> the signup.
          </p>
          <div style={{ maxWidth: 460 }}>
            <VendorPicker
              value={vendor && !vendor.custom ? vendor.id : null}
              selectedLabel={vendor?.label}
              onPick={(id) => setVendor(findVendor(id))}
              onCustom={(q) => setVendor(customVendor(q))}
            />
          </div>

          <Legend />

          {vendor && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <VendorLogo id={vendor.id} size={26} />
                <span style={{ fontFamily: font.ui, fontWeight: 600 }}>{vendor.label}</span>
                <Badge tone="berry">{vendor.category}</Badge>
                {vendor.custom && <Badge tone="amber">custom · no recipe</Badge>}
                {connected && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)" }}>
                    ✓ connected{connected.scopes.length ? ` · ${connected.scopes.join(", ")}` : ""}
                    {connected.expiresAt
                      ? ` · expires ${new Date(connected.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                )}
              </div>

              {/* "Do I have a root key?" — answerable at a glance. */}
              {hasRoot && (
                <p style={{ ...mono11, color: "var(--green)", margin: "0 0 8px" }}>
                  ✓ root already stored for {vendor.label} ({storedRoots.length} named
                  {storedRoots.length > 1 ? " roots" : " root"}) · machine-global, reused across
                  every project
                </p>
              )}

              {/* A SINK (Infisical) — written TO, not minted FROM. One-line distinction. */}
              {vendor.sink && (
                <p style={{ ...mono11, color: "var(--ink-soft)", margin: "0 0 8px" }}>
                  {vendor.label} is a <strong>sink</strong> — Ringtail WRITES minted keys here. It's
                  not a key source to mint from; paste its access token so keys can land.
                </p>
              )}

              {/* (a) OAuth mode — only for a canonical OAuth-capable provider. Never silently
                  hidden: needs-creds still shows, routed to paste / agent-guide. */}
              {vendor.oauth && !connected && (
                <OAuthMode
                  provider={vendor.id}
                  live={Boolean(live)}
                  needsCreds={connector?.needsClientCreds ?? false}
                  onPoll={refresh}
                />
              )}

              {/* (b) paste a named root — always available (the only path for a custom vendor) */}
              <PasteRootMode
                provider={vendor.id}
                live={Boolean(live)}
                varSeed={vendor.custom ? vendor.defaultVar : undefined}
                onStored={refresh}
              />

              {/* (c) agent-guided signup — real buttons + a copy-able agent prompt */}
              <AgentGuided vendor={vendor} connector={connector} agentName={agentName} />

              {/* Hold them: the explicit next step once the provider is actually held. */}
              {held && (
                <p style={{ ...mono11, color: "var(--green)", marginTop: 10 }}>
                  ✓ {vendor.label} connected — now ask your agent to provision a key (or it'll fill
                  the grid's “missing” cells).
                  {vendor.custom
                    ? " No recipe for a custom vendor: it stays paste + sink (no auto-mint)."
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// The legend — the two-axis mental model, spelled out so "are roots per-project or global?"
// is answered without asking anyone.
function Legend() {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        marginTop: 10,
        fontFamily: font.mono,
        fontSize: 11,
        color: "var(--ink-soft)",
      }}
    >
      <span>
        <strong style={{ color: "var(--green)" }}>roots</strong> — per-provider, machine-global (add
        once, reused across every project)
      </span>
      <span>
        <strong style={{ color: "var(--amber-deep)" }}>minted keys</strong> — per-project / per-env
        (the grid's LOCAL · DEV · STAGING · PROD)
      </span>
    </div>
  );
}

// ── (a) OAuth ─────────────────────────────────────────────────────────────────
function OAuthMode({
  provider,
  live,
  needsCreds,
  onPoll,
}: {
  provider: string;
  live: boolean;
  needsCreds: boolean;
  onPoll: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

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
      // Stop polling after 90s regardless (the status also refreshes on re-focus/mount).
      setTimeout(() => clearInterval(id), 90_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modeBox}>
      <div style={modeHead}>a · connect with OAuth</div>
      {needsCreds ? (
        <>
          <p style={{ ...mono11, color: "var(--ink-soft)", margin: "0 0 6px" }}>
            OAuth needs a one-time app setup on this daemon — until then, paste a key or let the
            agent guide you (both below).
          </p>
          <Button variant="ghost" size="sm" onClick={() => setHowOpen((v) => !v)}>
            {howOpen ? "hide setup" : "how to enable OAuth"}
          </Button>
          {howOpen && (
            <p style={{ ...mono11, color: "var(--ink-soft)", marginTop: 6 }}>
              Register an OAuth app with {provider} and set{" "}
              <code>RINGTAIL_OAUTH_{provider.toUpperCase()}_CLIENT_ID</code> (and secret, if the
              provider requires one) in the daemon's environment, then restart{" "}
              <code>ringtail up</code>.
            </p>
          )}
        </>
      ) : (
        <>
          <Button variant="primary" disabled={!live || busy} onClick={() => void connect()}>
            {busy ? "starting…" : waiting ? "waiting for authorization…" : "Connect with OAuth"}
          </Button>
          {waiting && (
            <span style={{ ...mono11, color: "var(--ink-soft)", marginLeft: 10 }}>
              approve in the tab that opened — this updates when the grant lands
            </span>
          )}
        </>
      )}
      {err && <p style={{ ...mono11, color: "var(--amber-deep)" }}>{err}</p>}
    </div>
  );
}

// ── (b) paste a named root ──────────────────────────────────────────────────────
function PasteRootMode({
  provider,
  live,
  varSeed,
  onStored,
}: {
  provider: string;
  live: boolean;
  /** For a CUSTOM vendor: an editable env-var name (seeded, stored as the root label). */
  varSeed?: string;
  onStored: () => void;
}) {
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [varName, setVarName] = useState(varSeed ?? "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the var name when the selected custom vendor changes.
  useEffect(() => setVarName(varSeed ?? ""), [varSeed]);

  async function submit() {
    if (!live || !value) return;
    setBusy(true);
    try {
      // The value leaves the browser ONLY here — straight to the daemon vault, never the
      // agent — and we drop it from state right after the POST.
      await submitRoot(provider, value, {
        label: (varSeed ? varName.trim() : label.trim()) || undefined,
        account: account.trim() || undefined,
      });
      setValue("");
      setLabel("");
      setAccount("");
      onStored();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modeBox}>
      <div style={modeHead}>b · paste a root key</div>
      {varSeed ? (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1.6fr" }}>
          <input
            placeholder="env var name"
            value={varName}
            disabled={!live || busy}
            onChange={(e) => setVarName(e.target.value)}
            style={inputStyle}
            aria-label="env var name"
          />
          <input
            type="password"
            placeholder="paste root key"
            value={value}
            disabled={!live || busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            style={inputStyle}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1.6fr" }}>
          <input
            placeholder="label (optional, e.g. prod)"
            value={label}
            disabled={!live || busy}
            onChange={(e) => setLabel(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="account (optional)"
            value={account}
            disabled={!live || busy}
            onChange={(e) => setAccount(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="paste root key"
            value={value}
            disabled={!live || busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            style={inputStyle}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 8,
        }}
      >
        <span style={{ ...mono11, color: "var(--green)" }}>🔒 goes to Ringtail, not the agent</span>
        <Button variant="primary" disabled={!live || !value || busy} onClick={() => void submit()}>
          {busy ? "storing…" : "store root key"}
        </Button>
      </div>
    </div>
  );
}

// ── (c) agent-guided signup ───────────────────────────────────────────────────
// Real BUTTONS (not descriptive text): open the provider's signup / manage-keys page in a
// new tab, and hand a connected agent a ready copy-able prompt. For a CUSTOM vendor with no
// catalogue entry, a best-effort web search stands in for the deep links.
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
    <div style={modeBox}>
      <div style={modeHead}>c · let the agent guide you</div>
      <p style={{ ...mono11, color: "var(--ink-soft)", margin: "0 0 8px" }}>
        Don't have an account yet? Open the signup, and hand your agent the prompt below — it walks
        you to the key, you paste it. No key ever passes through the agent.
      </p>
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

const helpText: CSSProperties = {
  fontFamily: font.ui,
  fontSize: 13,
  lineHeight: 1.5,
  margin: "6px 0 12px",
  color: "var(--ink-soft)",
};
const mono11: CSSProperties = { fontFamily: font.mono, fontSize: 11 };
const modeBox: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: radius.sm,
  padding: "10px 12px",
  marginTop: 10,
};
const modeHead: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  marginBottom: 8,
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
