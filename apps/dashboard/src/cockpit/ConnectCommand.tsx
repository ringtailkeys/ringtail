import { Badge, Button, Eyebrow, font, radius } from "@ringtail/ui";
import { useEffect, useState } from "react";
import { type AgentAddCommand, fetchAgentCommands } from "../live";

/**
 * The connect-agent command panel — the root-cause fix for "I had to be told a hidden
 * `claude mcp add` command." It ALWAYS renders the EXACT command, pre-filled with THIS
 * daemon's origin + loopback session token, with a copy button — so a stranger goes
 * clone → `ringtail up` → read the cockpit → connect their agent, with NO README and no
 * hidden knowledge. Claude Code is shown by default; a small toggle reveals other agents
 * (Codex) whose add-command differs.
 *
 * Value-free: the token is a LOOPBACK session token that gates the value-free /mcp surface
 * — it is NOT a secret VALUE, and no provider key ever rides it (that's the whole guarantee).
 *
 * Used in two places (DRY): step ① (the on-ramp) and a persistent panel in the cockpit, so
 * the command is always one copy away — reconnect an agent without leaving the cockpit.
 */
export function ConnectCommand({
  agentName,
  compact,
  commands: seed,
}: {
  /** When a coding agent is already connected over MCP → show a "connected ✓" confirm. */
  agentName?: string;
  /** Persistent cockpit placement: start collapsed behind a one-line summary. */
  compact?: boolean;
  /** Pre-seeded commands (Storybook/e2e) — skips the live token fetch when provided. */
  commands?: AgentAddCommand[];
}) {
  const [cmds, setCmds] = useState<AgentAddCommand[] | null>(seed ?? null);
  const [agentId, setAgentId] = useState("claude");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    if (seed) return;
    let live = true;
    void fetchAgentCommands().then((c) => live && setCmds(c));
    return () => {
      live = false;
    };
  }, [seed]);

  const chosen = cmds?.find((c) => c.id === agentId) ?? cmds?.[0] ?? null;

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
        borderRadius: radius.md,
        padding: "12px 14px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>your agent · connect over MCP</Eyebrow>
        {agentName && (
          <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--green)" }}>
            ✓ {agentName} connected
          </span>
        )}
        {compact && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "hide command" : "show connect command"}
          </Button>
        )}
      </div>

      {open && (
        <>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: "var(--ink-soft)",
              margin: "8px 0 10px",
            }}
          >
            Run this in your coding agent to connect it to THIS daemon — the URL + a loopback
            session token are filled in. The token gates the value-free MCP surface; it never
            carries a secret.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            {cmds?.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.id === (chosen?.id ?? "") ? "primary" : "ghost"}
                onClick={() => {
                  setAgentId(c.id);
                  setCopied(false);
                }}
              >
                {c.name}
              </Button>
            ))}
          </div>

          {chosen && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Badge tone="berry">{chosen.name}</Badge>
                <Button variant="ghost" size="sm" onClick={() => void copy(chosen.command)}>
                  {copied ? "copied ✓" : "copy"}
                </Button>
              </div>
              <pre
                data-testid="connect-command"
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: "var(--ink)",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: radius.sm,
                  padding: 12,
                  margin: 0,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {chosen.command}
              </pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
