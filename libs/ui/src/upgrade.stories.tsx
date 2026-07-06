import type { Meta, StoryObj } from "@storybook/react";
import { UpgradeModal } from "./upgrade";

/**
 * The upgrade modal — the shared Dodo-overlay surface (browser landing · `ringtail up` ·
 * native app). Three states forced via `initialState`: the plan summary (fresh), the
 * Dodo overlay (checkout/loading), and the unlocked success. Callbacks are stubbed.
 */
const meta = {
  title: "Billing/UpgradeModal",
  component: UpgradeModal,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof UpgradeModal>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = {
  open: true,
  onClose: () => undefined,
  onUpgraded: () => undefined,
  onCheckout: async () => ({ url: "about:blank" }),
  onPollTier: async () => "free" as const,
  usage: { projectsProvisioned: 1, freeLimit: 1 },
};

export const Fresh: Story = {
  args: { ...base, limitReached: true, initialState: "plan" },
};

export const Loading: Story = {
  // `checkout` with no url yet → the "opening the Dodo overlay…" loading state.
  args: { ...base, initialState: "checkout" },
};

export const Success: Story = {
  args: { ...base, initialState: "success" },
};
