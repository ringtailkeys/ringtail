import { expect, test } from "bun:test";
import { agentAddCommands } from "./live";

// The "hidden `claude mcp add`" fix: the exact command must render, pre-filled with THIS
// daemon's origin + session token — no README, no hidden knowledge.

test("claude command interpolates origin + token exactly", () => {
  const claude = agentAddCommands("http://127.0.0.1:4877", "tok-abc")[0];
  expect(claude?.id).toBe("claude");
  expect(claude?.command).toBe(
    'claude mcp add ringtail --transport http http://127.0.0.1:4877/mcp --header "Authorization: Bearer tok-abc"',
  );
});

test("Claude Code is the default (first) agent; Codex is offered as an alternate", () => {
  const cmds = agentAddCommands("http://x", "t");
  expect(cmds[0]?.id).toBe("claude");
  const codex = cmds.find((c) => c.id === "codex");
  expect(codex?.command).toContain("mcp_servers.ringtail");
  expect(codex?.command).toContain("http://x/mcp");
  expect(codex?.command).toContain("Bearer t");
});
