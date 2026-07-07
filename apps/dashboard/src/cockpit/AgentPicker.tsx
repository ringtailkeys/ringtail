import { Badge, Button, Eyebrow, font } from "@ringtail/ui";
import { useEffect, useState } from "react";
import { fetchAgents, type DetectedAgent } from "../live";

/**
 * The agent picker (architecture.md §"Entry & agent selection — OpenDesign pattern").
 * On load the daemon detects installed coding-agent CLIs on PATH; here you pick one
 * (or "guided / manual") and get the EXACT command that registers this daemon as an
 * MCP server for that agent — URL + session token filled in. Copy it into the agent
 * and it starts driving; the grid + wizards stream here.
 *
 * ponytail: shows detection + picker + copy-command (the load-bearing 90%). Headless
 * auto-spawn is a follow-up — the command is one paste away regardless.
 *
 * `onConnect` is step 1's commit: once you've picked an agent (and pasted its connect
 * command), "Continue →" hands the id up so the daemon records it and the onboarding
 * gate advances to step 2 (pick a project).
 */
export function AgentPicker({
  onConnect,
  agents: seed,
}: {
  onConnect?: (id: string) => void;
  /** Pre-seeded agents (Storybook/tests) — skips the live daemon fetch when provided. */
  agents?: DetectedAgent[];
}) {
  const [agents, setAgents] = useState<DetectedAgent[] | null>(seed ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!seed) void fetchAgents().then(setAgents);
  }, [seed]);

  if (!agents || agents.length === 0) return null; // daemon down → nothing to pick
  const installed = agents.filter((a) => a.present);
  const chosen = agents.find((a) => a.id === picked) ?? null;
  // What "Continue" commits: a detected agent, or the guided/manual path.
  const connectId = chosen?.id ?? (picked === "manual" ? "manual" : null);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (no https / permission) — the block is still selectable.
    }
  }

  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: 16,
        margin: "0 0 24px",
      }}
    >
      <Eyebrow>connect your agent</Eyebrow>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: "var(--ink-soft)",
          margin: "6px 0 12px",
        }}
      >
        Pick the coding agent that will drive the raid. It connects over MCP with a loopback session
        token — never a secret value.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {installed.map((a) => (
          <Button
            key={a.id}
            variant={picked === a.id ? "primary" : "ghost"}
            onClick={() => {
              setPicked(a.id);
              setCopied(false);
            }}
          >
            {/* green dot = detected on PATH / ready to connect (OpenDesign affordance) */}
            <span style={{ color: "var(--green)", marginRight: 6 }} title="detected · ready">
              ●
            </span>
            {a.name}
          </Button>
        ))}
        <Button
          variant={picked === "manual" ? "primary" : "ghost"}
          onClick={() => setPicked("manual")}
        >
          guided / manual
        </Button>
      </div>

      {installed.length > 0 && (
        <p style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)", marginTop: 8 }}>
          {installed.length} agent{installed.length > 1 ? "s" : ""} detected on your PATH · ready to
          connect
        </p>
      )}

      {installed.length === 0 && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
          No agent CLIs found on PATH — pick “guided / manual”.
        </p>
      )}

      {chosen && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Badge tone="berry">{chosen.name}</Badge>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
              run this to connect:
            </span>
            <Button variant="ghost" size="sm" onClick={() => void copy(chosen.connect)}>
              {copied ? "copied ✓" : "copy"}
            </Button>
          </div>
          <pre
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: "var(--ink)",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              padding: 12,
              margin: 0,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {chosen.connect}
          </pre>
        </div>
      )}

      {picked === "manual" && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)", marginTop: 12 }}>
          Guided/manual: you drive the wizard yourself — paste keys as the grid asks. No agent
          required.
        </p>
      )}

      {connectId && onConnect && (
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={() => onConnect(connectId)}>
            Continue →
          </Button>
        </div>
      )}
    </section>
  );
}
