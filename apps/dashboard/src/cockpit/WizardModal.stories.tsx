import type { Wizard } from "@ringtail/core";
import type { Meta, StoryObj } from "@storybook/react";
import { WizardModal } from "./WizardModal";

/**
 * The UNIVERSAL wizard — one component paints any agent-authored raid: open-url →
 * paste (the trust linchpin: "goes to Ringtail, not the agent") → auto → confirm.
 * A failed step flips it into a rendered recovery surface (Rocco's error pose + the
 * plain-language cause), never a dead end. Storybook keeps the paste input inert
 * (no onSubmit) — the live cockpit wires the user → daemon POST.
 */
const meta = {
  title: "Cockpit/WizardModal",
  component: WizardModal,
} satisfies Meta<typeof WizardModal>;
export default meta;
type Story = StoryObj<typeof meta>;

// A fresh Cloudflare raid: open the token page, paste it back, Ringtail syncs.
const FRESH: Wizard = {
  id: "cf-raid",
  title: "Raid Cloudflare",
  provider: "Cloudflare",
  steps: [
    {
      id: "s1",
      title: "Open the token page",
      description: "Rocco needs you to authorize once — the only human step.",
      kind: "open-url",
      payload: {
        url: "https://dash.cloudflare.com/profile/api-tokens",
        scopes: ["Zone:Read", "DNS:Edit"],
      },
      status: "active",
    },
    {
      id: "s2",
      title: "Paste the token",
      description: "It goes straight to Ringtail — the agent never sees it.",
      kind: "paste",
      payload: { varName: "CLOUDFLARE_API_TOKEN" },
      status: "pending",
    },
    {
      id: "s3",
      title: "Validate scope + sync",
      description: "Ringtail checks the scope and stashes it in .env.local.",
      kind: "auto",
      status: "pending",
    },
  ],
};

// Mid-raid — step 1 done, paste active, sync waiting.
const IN_PROGRESS: Wizard = {
  ...FRESH,
  steps: [
    { ...FRESH.steps[0]!, status: "done" },
    { ...FRESH.steps[1]!, status: "active" },
    { ...FRESH.steps[2]!, status: "pending" },
  ],
};

// Recovery — the sync failed (wrong scope). The wizard becomes the fix surface.
const RECOVERY: Wizard = {
  ...FRESH,
  steps: [
    { ...FRESH.steps[0]!, status: "done" },
    { ...FRESH.steps[1]!, status: "done" },
    {
      ...FRESH.steps[2]!,
      title: "Validate scope + sync",
      description: "Token is missing DNS:Edit — re-issue it with the DNS scope ticked.",
      status: "failed",
    },
  ],
};

// A destructive action's confirm gate (two-step hard-confirm, daemon-enforced).
const DESTRUCTIVE: Wizard = {
  id: "rotate",
  title: "Rotate the production key",
  provider: "Stripe",
  steps: [
    {
      id: "d1",
      title: "Confirm rotation",
      description: "This revokes the current live key. Anything still using it breaks.",
      kind: "confirm",
      danger: "destructive",
      status: "active",
    },
  ],
};

export const FreshRaid: Story = { name: "Fresh raid", args: { wizard: FRESH } };
export const InProgress: Story = { name: "In progress", args: { wizard: IN_PROGRESS } };
export const Recovery: Story = { name: "Failed / recovery", args: { wizard: RECOVERY } };
export const Destructive: Story = { name: "Destructive confirm", args: { wizard: DESTRUCTIVE } };
