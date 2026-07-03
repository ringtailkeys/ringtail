import type { ConnStatus, ProviderStatus } from "@ringtail/core";
import { cssVars, font, moonlit, radius } from "@ringtail/ui";
import { useEffect, useState } from "react";
import roccoChill from "../../.brand-assets/rocco-chill.png";

/**
 * The LOCAL cockpit. Reads the daemon's /api/status and renders the providers ×
 * {dev,staging,prod} connection grid. Brand tokens come from @ringtail/ui — no
 * raw hex here (see docs/brand/design-lock.md). ZERO TELEMETRY: this app makes
 * exactly one network call, to the local daemon. Nothing phones home.
 */

// Configurable daemon origin; default = @ringtail/config's DAEMON_PORT (4880) on localhost.
// ponytail: portless URLs aren't wired yet — swap this default for the portless
// daemon URL once ./tilt_up.sh assigns one.
const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:4880";

const ENVS = ["dev", "staging", "prod"] as const;

// Shown when the daemon is down — same shape as /api/status, honestly all needs-consent.
const STUB: ProviderStatus[] = [
  {
    id: "cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: { dev: "needs-consent", staging: "needs-consent", prod: "needs-consent" },
  },
  {
    id: "database",
    envVars: ["DATABASE_URL"],
    envs: { dev: "needs-consent", staging: "needs-consent", prod: "needs-consent" },
  },
  {
    id: "resend",
    envVars: ["RESEND_API_KEY"],
    envs: { dev: "needs-consent", staging: "needs-consent", prod: "needs-consent" },
  },
];

const CELL: Record<ConnStatus, { glyph: string; label: string; color: string }> = {
  // Green is SACRED — only a genuinely synced key earns it.
  connected: { glyph: "✓", label: "connected", color: moonlit.green },
  missing: { glyph: "✗", label: "missing", color: moonlit.danger },
  "needs-consent": { glyph: "⏳", label: "needs consent", color: moonlit.amberDeep },
};

export function App() {
  const [providers, setProviders] = useState<ProviderStatus[]>(STUB);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${DAEMON_URL}/api/status`)
      .then((r) => r.json() as Promise<{ providers: ProviderStatus[] }>)
      .then((d) => {
        if (cancelled) return;
        setProviders(d.providers);
        setLive(true);
      })
      .catch(() => {
        // Daemon down → keep the stub. Not an error the human needs to see; the
        // status pill already says "daemon offline".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style>{cssVars(moonlit)}</style>
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
          <Grid providers={providers} />
        </div>
      </div>
    </>
  );
}

function Header({ live }: { live: boolean }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 40 }}>
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
      <StatusPill live={live} />
    </header>
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
      {live ? "● daemon live" : "○ daemon offline — showing stub"}
    </span>
  );
}

function Grid({ providers }: { providers: ProviderStatus[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <Th>provider</Th>
            {ENVS.map((e) => (
              <Th key={e} align="center">
                {e}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id} style={{ borderTop: `1px solid var(--line)` }}>
              <td style={{ padding: "16px 12px" }}>
                <div style={{ fontFamily: font.ui, fontWeight: 600 }}>{p.id}</div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                  {p.envVars.join(" · ")}
                </div>
              </td>
              {ENVS.map((e) => (
                <Cell key={e} status={p.envs[e]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "0 12px 12px",
        fontFamily: font.mono,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--ink-soft)",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Cell({ status }: { status: ConnStatus }) {
  const c = CELL[status];
  return (
    <td style={{ padding: "16px 12px", textAlign: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: c.color,
          fontFamily: font.mono,
          fontSize: 13,
        }}
      >
        <span aria-hidden style={{ fontSize: 15 }}>
          {c.glyph}
        </span>
        {c.label}
      </span>
    </td>
  );
}
