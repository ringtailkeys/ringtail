import type { GridRow } from "@ringtail/core";
import {
  ActionsPanel,
  type ActionItem,
  ChatPanel,
  type ChatLine,
  Reveal,
  Rocco,
  font,
  roccoLine,
} from "@ringtail/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { LiveGrid } from "./LiveGrid";

/**
 * The whole cockpit as one screen (step ③): the live grid + the NEXT ACTIONS the
 * agent mapped + the TALK TO THE AGENT chat, everything springing in with a stagger.
 * Two moments: mid-raid (work in flight, actions queued) and all-green (the payoff —
 * Rocco cheers when every cell is home). Presentational — the real App wires the daemon.
 */
const meta = { title: "Flows/Cockpit" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const MID: GridRow[] = [
  {
    provider: "Cloudflare",
    envVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    envs: { local: "synced", dev: "synced", staging: "provisioning", prod: "missing" },
  },
  {
    provider: "Database",
    envVars: ["DATABASE_URL"],
    envs: { local: "synced", dev: "validating", staging: "missing", prod: "missing" },
  },
  {
    provider: "Resend",
    envVars: ["RESEND_API_KEY"],
    envs: { local: "needs-consent", dev: "missing", staging: "missing", prod: "missing" },
  },
];

const GREEN: GridRow[] = MID.map((r) => ({
  ...r,
  envs: { local: "synced", dev: "synced", staging: "synced", prod: "synced" },
}));

const ACTIONS: ActionItem[] = [
  {
    id: "neon-branch",
    title: "Neon branch per env",
    why: "dev / staging / prod each want their own DATABASE_URL — one branch each.",
    danger: "safe",
  },
  {
    id: "cf-infisical",
    title: "Wire Infisical → Cloudflare",
    why: "push the stashed CF token to the deployed envs so CI can read it.",
    danger: "confirm",
    prerequisites: ["cloudflare"],
  },
  {
    id: "rotate-stripe",
    title: "Rotate the old Stripe key",
    why: "the committed test key leaked in git history — revoke it.",
    danger: "destructive",
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

function CockpitScreen({ grid, actions }: { grid: GridRow[]; actions: ActionItem[] }) {
  return (
    <div style={{ maxWidth: 1120 }}>
      <LiveGrid grid={grid} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          marginTop: 28,
          alignItems: "start",
        }}
      >
        <Reveal delay={140}>
          <ActionsPanel actions={actions} />
        </Reveal>
        <Reveal delay={200}>
          <ChatPanel messages={CHAT} disabled />
        </Reveal>
      </div>
    </div>
  );
}

export const MidRaid: Story = {
  name: "Mid-raid",
  render: () => <CockpitScreen grid={MID} actions={ACTIONS} />,
};

export const AllGreen: Story = {
  name: "All green (payoff)",
  render: () => (
    <div style={{ maxWidth: 1120 }}>
      <Reveal>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            padding: 16,
            borderRadius: "var(--r-md)",
            border: "1px solid color-mix(in srgb, var(--green) 40%, var(--line))",
            background: "color-mix(in srgb, var(--green) 10%, transparent)",
          }}
        >
          <Rocco pose="success" animated size={72} />
          <div>
            <div style={{ fontFamily: font.display, fontSize: 22, color: "var(--green)" }}>
              every key home.
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
              “{roccoLine("success")}”
            </div>
          </div>
        </div>
      </Reveal>
      <CockpitScreen grid={GREEN} actions={[]} />
    </div>
  ),
};
