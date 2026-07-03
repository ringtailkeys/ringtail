import {
  Badge,
  type CredentialStatus,
  Eyebrow,
  Rocco,
  Skeleton,
  StatusChip,
  StatusDot,
  font,
  roccoLine,
} from "@ringtail/ui";
import { ENVS, type Env, type Provider } from "./fixtures";

/**
 * The cockpit's connection grid: providers × {dev, staging, prod}. Driven purely
 * by fixtures — no daemon. Env tabs focus a column; empty / loading / error are
 * first-class states, each with Rocco in the matching pose and voice.
 */

export function StatusCell({ status, dim }: { status: CredentialStatus; dim?: boolean }) {
  return (
    <td style={{ padding: "14px 12px", textAlign: "center", opacity: dim ? 0.5 : 1 }}>
      <StatusChip status={status} />
    </td>
  );
}

export function ProviderRow({ provider, activeEnv }: { provider: Provider; activeEnv?: Env }) {
  return (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <td style={{ padding: "14px 12px" }}>
        <div style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--ink)" }}>
          {provider.id}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
          {provider.envVars.join(" · ")}
        </div>
      </td>
      {ENVS.map((e) => (
        <StatusCell key={e} status={provider.envs[e]} dim={Boolean(activeEnv) && activeEnv !== e} />
      ))}
    </tr>
  );
}

function EnvTabs({ active, onSelect }: { active?: Env; onSelect?: (e: Env) => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-pill)",
      }}
    >
      {(["dev", "staging", "prod"] as const).map((e) => {
        const on = active === e;
        return (
          <button
            key={e}
            onClick={() => onSelect?.(e)}
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              letterSpacing: "0.04em",
              padding: "6px 14px",
              borderRadius: "var(--r-pill)",
              border: "none",
              cursor: "pointer",
              color: on ? "var(--ink)" : "var(--ink-soft)",
              background: on ? "var(--amber)" : "transparent",
            }}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}

function Header({ providers }: { providers: Provider[] }) {
  const cells = providers.flatMap((p) => ENVS.map((e) => p.envs[e]));
  const synced = cells.filter((c) => c === "synced" || c === "validated").length;
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
      <Rocco pose={synced === cells.length && cells.length > 0 ? "success" : "chill"} size={64} />
      <div style={{ flex: 1 }}>
        <h1
          style={{
            fontFamily: font.display,
            fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
            margin: 0,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          ringtail
        </h1>
        <Eyebrow>your keys, raided · washed · stashed</Eyebrow>
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: font.mono,
          fontSize: 12,
          color: synced > 0 ? "var(--green)" : "var(--ink-soft)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-pill)",
          padding: "6px 12px",
        }}
      >
        <StatusDot status={synced > 0 ? "synced" : "missing"} />
        {synced}/{cells.length} in sync
      </span>
    </header>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg)",
        padding: "clamp(20px, 4vw, 48px)",
        borderRadius: "var(--r-md)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

export function ConnectionGrid({
  providers,
  activeEnv,
  onEnv,
  state = "ready",
}: {
  providers: Provider[];
  activeEnv?: Env;
  onEnv?: (e: Env) => void;
  state?: "ready" | "loading" | "error";
}) {
  if (state === "loading") {
    return (
      <Frame>
        <Header providers={providers} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Rocco pose="working" size={48} />
          <span style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
            {roccoLine("working")}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </div>
      </Frame>
    );
  }

  if (state === "error") {
    return (
      <Frame>
        <Header providers={providers} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 24,
            background: "color-mix(in srgb, var(--danger) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
            borderRadius: "var(--r-md)",
          }}
        >
          <Rocco pose="error" size={64} />
          <div>
            <div style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--danger)" }}>
              daemon unreachable
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
              {roccoLine("error")}
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  const empty = providers.every((p) => ENVS.every((e) => p.envs[e] === "missing"));

  return (
    <Frame>
      <Header providers={providers} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <EnvTabs active={activeEnv} onSelect={onEnv} />
        <div style={{ display: "flex", gap: 8 }}>
          <Badge>MIT</Badge>
          <Badge tone="berry">local-first</Badge>
          <Badge tone="amber">no telemetry</Badge>
        </div>
      </div>

      {empty && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            fontFamily: font.mono,
            fontSize: 12,
            color: "var(--ink-soft)",
          }}
        >
          <Rocco pose="waving" size={40} />
          no keys stashed yet — point rocco at your <code>.env.example</code> and go to bed.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={thStyle("left")}>provider</th>
              {ENVS.map((e) => (
                <th
                  key={e}
                  style={{
                    ...thStyle("center"),
                    color: activeEnv === e ? "var(--amber-deep)" : "var(--ink-soft)",
                  }}
                >
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <ProviderRow key={p.id} provider={p} activeEnv={activeEnv} />
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function thStyle(align: "left" | "center"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "0 12px 10px",
    fontFamily: font.mono,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--ink-soft)",
    fontWeight: 500,
  };
}
