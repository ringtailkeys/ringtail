import type { GridRow } from "@ringtail/core";
import { ActionsPanel, ChatPanel, type ChatLine } from "@ringtail/ui";
import type { Meta, StoryObj } from "@storybook/react";
import type { DetectedAgent, ProjectCandidate } from "../live";
import { AgentPicker } from "./AgentPicker";
import { ChooseProject } from "./ChooseProject";
import { LiveGrid } from "./LiveGrid";

/**
 * The 3-step on-ramp (architecture.md §"Entry & agent selection"): ① connect your
 * coding agent → ② choose the local project → ③ the cockpit. One decision per screen
 * (progressive disclosure). These stories seed each step with fixtures so it renders
 * without a live daemon — the App gates which one you actually see off daemon state.
 */
const meta = {
  title: "Flows/Onboarding",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Story handlers are inert — the App wires the real daemon calls.
const noop = () => undefined;

const AGENTS: DetectedAgent[] = [
  { id: "claude", name: "Claude Code", present: true, connect: "claude mcp add ringtail …" },
  { id: "gemini", name: "Gemini CLI", present: true, connect: "gemini mcp add ringtail …" },
  { id: "codex", name: "Codex CLI", present: false, connect: "# ~/.codex/config.toml …" },
];

const PROJECTS: ProjectCandidate[] = [
  { path: "/Users/you/Development/my-app", name: "my-app", hasEnvExample: true },
  { path: "/Users/you/Development/ringtail", name: "ringtail", hasEnvExample: true },
  { path: "/Users/you/Development/side-quest", name: "side-quest", hasEnvExample: true },
];

// A grid as it looks once built from a chosen project's `.env.example`.
const GRID: GridRow[] = [
  {
    provider: "Cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: { local: "synced", dev: "synced", staging: "provisioning", prod: "missing" },
  },
  {
    provider: "Database",
    envVars: ["DATABASE_URL"],
    envs: { local: "synced", dev: "validated", staging: "missing", prod: "missing" },
  },
  {
    provider: "Email",
    envVars: ["RESEND_API_KEY"],
    envs: { local: "missing", dev: "missing", staging: "missing", prod: "missing" },
  },
];

const CHAT: ChatLine[] = [
  {
    role: "agent",
    text: "Scanned my-app — 3 providers on the manifest. Raiding Cloudflare first.",
    ts: 1,
  },
  { role: "user", text: "skip prod for now", ts: 2 },
  { role: "agent", text: "Got it — provisioning local · dev · staging, holding prod.", ts: 3 },
];

export const ConnectAgent: Story = {
  name: "① Connect agent",
  render: () => (
    <div style={{ maxWidth: 620 }}>
      <AgentPicker agents={AGENTS} onConnect={noop} />
    </div>
  ),
};

export const ChooseProjectStep: Story = {
  name: "② Choose project",
  render: () => (
    <ChooseProject agentName="Claude Code" projects={PROJECTS} onChoose={noop} onBack={noop} />
  ),
};

export const Cockpit: Story = {
  name: "③ Cockpit",
  render: () => (
    <div>
      <LiveGrid grid={GRID} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          marginTop: 28,
          alignItems: "start",
        }}
      >
        <ActionsPanel actions={[]} />
        <ChatPanel messages={CHAT} disabled />
      </div>
    </div>
  ),
};
