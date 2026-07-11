import { Badge, Button, Card, Eyebrow, Rocco, font } from "@ringtail/ui";
import type { RootInfo } from "@ringtail/core";
import { type CSSProperties, useState } from "react";
import { submitRoot } from "../live";

/**
 * The root-key intake — the ONE human moment (PRD §"Root keys — the one human
 * moment"). The user pastes an account MASTER key (the key that MINTS other keys)
 * for a provider; it flows user → daemon → the GLOBAL ~/.ringtail vault, exactly like
 * a `paste` step and NEVER through the agent. Stored once, reused across every repo +
 * env; the agent authors `mintKey` actions that spend it, but never submits or sees it.
 *
 * MULTI-ROOT (PRD §4.4): a provider can hold MANY roots — an optional label (e.g.
 * "prod"/"staging") distinguishes siblings, so several projects/accounts are all set up,
 * not just one. The mint flow later asks WHICH to spend.
 *
 * Value-free by construction: on success we show WHICH roots are now held (labels +
 * accounts, from the daemon's value-free `roots` list) — never a value. The key input is
 * a password field with the persistent "🔒 goes to Ringtail" affordance.
 */
export function RootIntake({ live }: { live?: boolean }) {
  const [provider, setProvider] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [roots, setRoots] = useState<RootInfo[]>([]);

  async function submit() {
    if (!live || !provider.trim() || !value) return;
    setBusy(true);
    try {
      // The value leaves the browser ONLY here — straight to the daemon vault. It
      // never touches the agent, and we drop it from state right after the POST.
      const r = await submitRoot(provider.trim(), value, { label: label.trim() || undefined });
      setRoots(r.roots);
      setValue("");
      setLabel("");
      setProvider("");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(live) && Boolean(provider.trim()) && Boolean(value) && !busy;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <Rocco pose="waving" size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>root keys · the one human moment</Eyebrow>
          <p
            style={{
              fontFamily: font.ui,
              fontSize: 13,
              lineHeight: 1.5,
              margin: "6px 0 12px",
              color: "var(--ink-soft)",
            }}
          >
            Paste a provider's <strong>account master key</strong> — the key that mints other keys —
            once. It's stored in your global vault; Rocco spends it to mint scoped keys, and the
            agent never sees it.
          </p>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.6fr)",
            }}
          >
            <input
              placeholder="provider (e.g. resend)"
              value={provider}
              disabled={!live || busy}
              onChange={(e) => setProvider(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="label (optional, e.g. prod)"
              value={label}
              disabled={!live || busy}
              onChange={(e) => setLabel(e.target.value)}
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
            <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)" }}>
              🔒 goes to Ringtail, not the agent
            </span>
            <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "storing…" : "store root key"}
            </Button>
          </div>
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

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontFamily: font.mono,
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm)",
};
