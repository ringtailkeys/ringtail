import type { Meta, StoryObj } from "@storybook/react";
import { AccountView } from "./account";

/**
 * AccountView — the ONE shared account surface (native app · web `apps/app` · OSS
 * dashboard, app edition). Presentational + data-source-agnostic: plain props + two
 * callbacks, no daemon import. Every state below is driven purely by props.
 */
const meta = {
  title: "Account/AccountView",
  component: AccountView,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof AccountView>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  email: "rocco@ringtail.dev",
  onManageBilling: () => undefined,
  onSignOut: () => undefined,
};

export const FreeFresh: Story = {
  args: { ...base, tier: "free", usage: { projectsProvisioned: 0, freeLimit: 1 } },
};

export const FreeAtLimit: Story = {
  args: { ...base, tier: "free", usage: { projectsProvisioned: 1, freeLimit: 1 } },
};

export const Pro: Story = {
  args: {
    ...base,
    tier: "pro",
    expiresAt: "2026-08-07",
    usage: { projectsProvisioned: 7, freeLimit: 1 },
  },
};

export const Loading: Story = {
  args: { ...base, tier: "free", usage: { projectsProvisioned: 0, freeLimit: 1 }, loading: true },
};
