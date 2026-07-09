import { Badge, Button, Card, Eyebrow, Rocco, font, radius } from "@ringtail/ui";
import type { RootInfo } from "@ringtail/core";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { type ConnectStatus, connectStart, fetchConnectStatus, submitRoot } from "../live";
import { VendorLogo, VendorPicker } from "./VendorPicker";
import { VENDORS } from "./vendors";

/**
 * The connect surface (PRD §4.8 + §4.9) — the ONE human moment, now vendor-driven and
 * three-moded. Pick a provider from the canonical autocomplete (VendorPicker → canonical
 * id, the casing-footgun fix), then connect it one of three ways:
 *
 *   (a) OAuth "Connect"  → POST /api/connect/start → open the authorizeUrl in a new tab →
 *       poll GET /api/connect/status until the grant lands → "Connected ✓ (scopes · expiry)".
 *   (b) Paste a named root (label + account + value) → POST /api/root. The value field is the
 *       ONLY place a secret is typed; it goes straight to the daemon and is dropped from state
 *       right after the POST — NEVER rendered back.
 *   (c) Agent-guided signup — the managed agent drives this dynamically; here we surface the
 *       entry point (sign-up / manage-keys deep links from the connector catalogue).
 *
 * Value-free by construction: the picker/status/roots surfaces carry ids · labels · scopes ·
 * expiry only. THE GUARANTEE (agent never sees a value) holds — the one secret input posts
 * direct to the daemon vault, never through the agent, never echoed.
 */
export function ConnectPanel({ live }: { live?: boolean }) {
  const [provider, setProvider] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectStatus>({ connected: [], connectors: [] });
  const [roots, setRoots] = useState<RootInfo[]>([]);

  const vendor = provider ? (VENDORS.find((v) => v.id === provider) ?? null) : null;
  const connected = provider
    ? (status.connected.find((c) => c.provider === provider) ?? null)
    : null;
  const connector = provider ? (status.connectors.find((c) => c.id === provider) ?? null) : null;

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
            Search a provider, then connect it: <strong>OAuth</strong> (one click),{" "}
            <strong>paste a root key</strong> (goes straight to Ringtail), or let the{" "}
            <strong>agent guide</strong> the signup.
          </p>
          <div style={{ maxWidth: 460 }}>
            <VendorPicker value={provider} onPick={setProvider} />
          </div>

          {vendor && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <VendorLogo id={vendor.id} size={26} />
                <span style={{ fontFamily: font.ui, fontWeight: 600 }}>{vendor.label}</span>
                <Badge tone="berry">{vendor.category}</Badge>
                {connected && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)" }}>
                    ✓ connected{connected.scopes.length ? ` · ${connected.scopes.join(", ")}` : ""}
                    {connected.expiresAt
                      ? ` · expires ${new Date(connected.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                )}
              </div>

              {/* (a) OAuth mode — only when the provider supports it */}
              {vendor.oauth && !connected && (
                <OAuthMode
                  provider={vendor.id}
                  live={Boolean(live)}
                  needsCreds={connector?.needsClientCreds ?? false}
                  onPoll={refresh}
                />
              )}

              {/* (b) paste a named root — always available */}
              <PasteRootMode
                provider={vendor.id}
                live={Boolean(live)}
                onStored={(r) => {
                  setRoots(r);
                  refresh();
                }}
              />

              {/* (c) agent-guided signup entry point */}
              <AgentGuided connector={connector} />
            </div>
          )}

          {roots.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                roots held:
              </span>
              {roots.map((r) => (
                <Badge key={r.id} tone="berry">
                  {r.provider}
                  {r.label ? ` · ${r.label}` : ""}
                  {r.account ? ` (${r.account})` : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
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
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (poll.current && clearInterval(poll.current)), []);

  async function connect() {
    if (!live) return;
    setBusy(true);
    setErr(null);
    try {
      const { authorizeUrl } = await connectStart(provider);
      window.open(authorizeUrl, "_blank", "noopener");
      // Poll the value-free status while the user completes the flow in the other tab.
      setWaiting(true);
      poll.current = setInterval(onPoll, 2000);
      // Stop polling after 90s regardless (the status also refreshes on re-focus/mount).
      setTimeout(() => poll.current && clearInterval(poll.current), 90_000);
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
        <p style={{ ...mono11, color: "var(--ink-soft)" }}>
          this provider needs an OAuth app configured on the daemon — paste a root key instead, or
          set its client id.
        </p>
      ) : (
        <>
          <Button variant="primary" disabled={!live || busy} onClick={() => void connect()}>
            {busy ? "starting…" : waiting ? "waiting for authorization…" : "Connect"}
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
  onStored,
}: {
  provider: string;
  live: boolean;
  onStored: (roots: RootInfo[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!live || !value) return;
    setBusy(true);
    try {
      // The value leaves the browser ONLY here — straight to the daemon vault, never the
      // agent — and we drop it from state right after the POST.
      const r = await submitRoot(provider, value, {
        label: label.trim() || undefined,
        account: account.trim() || undefined,
      });
      setValue("");
      setLabel("");
      setAccount("");
      onStored(r.roots);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={modeBox}>
      <div style={modeHead}>b · paste a root key</div>
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
function AgentGuided({ connector }: { connector: ConnectStatus["connectors"][number] | null }) {
  return (
    <div style={modeBox}>
      <div style={modeHead}>c · let the agent guide you</div>
      <p style={{ ...mono11, color: "var(--ink-soft)", margin: 0 }}>
        Don’t have an account yet? The agent walks you through signup and comes back with a key to
        paste — no key ever passes through it.
      </p>
      {connector && (connector.signupUrl || connector.apiKeysUrl) && (
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          {connector.signupUrl && (
            <a
              href={connector.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              sign up ↗
            </a>
          )}
          {connector.apiKeysUrl && (
            <a
              href={connector.apiKeysUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              manage keys ↗
            </a>
          )}
        </div>
      )}
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
const linkStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  color: "var(--green)",
  textDecoration: "underline",
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
