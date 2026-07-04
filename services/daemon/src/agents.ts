/**
 * Agent detection + the exact MCP-connect command per coding agent (architecture.md
 * §"Entry & agent selection — OpenDesign pattern"). On `ringtail up` the daemon
 * scans PATH for installed agent CLIs (via Bun.which) and hands the dashboard a
 * picker. Picking one reveals the copy-paste command that registers THIS daemon as
 * an MCP server for that agent — URL + session token filled in.
 *
 * The token rides in the command (Authorization: Bearer). That's the same token
 * that gates /mcp — the agent must present it on every call. It never grants the
 * agent a secret VALUE; it only lets it drive the value-free MCP surface.
 *
 * ponytail: the `claude` command is exact + verified. gemini/codex/cursor use each
 * tool's documented MCP-add shape (best-effort per their current CLI/config); tweak
 * per your agent version if it drifts. Headless spawn is a follow-up — detection +
 * picker + copy-command is the load-bearing 90%.
 */

export interface DetectedAgent {
  id: string;
  name: string;
  bin: string;
  present: boolean;
  /** The copy-paste command (or config block) that connects this daemon to the agent. */
  connect: string;
}

interface AgentDef {
  id: string;
  name: string;
  bin: string;
  connect: (mcpUrl: string, token: string) => string;
}

const AGENTS: AgentDef[] = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    connect: (url, token) =>
      `claude mcp add ringtail --transport http ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    connect: (url, token) =>
      `gemini mcp add ringtail --transport http ${url} --header "Authorization: Bearer ${token}"`,
  },
  {
    id: "codex",
    name: "Codex CLI",
    bin: "codex",
    // Codex is config-driven (~/.codex/config.toml) for HTTP MCP servers.
    connect: (url, token) =>
      `# add to ~/.codex/config.toml\n[mcp_servers.ringtail]\nurl = "${url}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
  },
  {
    id: "cursor",
    name: "Cursor",
    bin: "cursor",
    // Cursor is config-driven (~/.cursor/mcp.json).
    connect: (url, token) =>
      `// add to ~/.cursor/mcp.json\n${JSON.stringify(
        { mcpServers: { ringtail: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      )}`,
  },
];

/** Scan PATH for each agent CLI; return every candidate with present + its connect command. */
export function detectAgents(mcpUrl: string, token: string): DetectedAgent[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    bin: a.bin,
    present: Bun.which(a.bin) != null,
    connect: a.connect(mcpUrl, token),
  }));
}
