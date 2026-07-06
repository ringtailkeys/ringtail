import type { GridRow } from "@ringtail/core";
import type { Meta, StoryObj } from "@storybook/react";
import { LiveGrid } from "./LiveGrid";

/**
 * The live connection grid across its lifecycle: a fresh machine (all missing), a
 * raid in flight (validating/provisioning pulse), everybody home (sacred green), and
 * a failed cell (a first-class recovery state, not a dead end). Rows spring in with a
 * stagger — the same shared motion both shells render. Green is SACRED: only
 * validated/synced earn it.
 */
const meta = {
  title: "Cockpit/LiveGrid",
  component: LiveGrid,
} satisfies Meta<typeof LiveGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

const CF = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];

// Fresh machine — nothing raided yet, every cell honestly missing.
const EMPTY: GridRow[] = [
  { provider: "Cloudflare", envVars: CF, envs: row("missing") },
  { provider: "Database", envVars: ["DATABASE_URL"], envs: row("missing") },
  { provider: "Resend", envVars: ["RESEND_API_KEY"], envs: row("missing") },
  { provider: "Stripe", envVars: ["STRIPE_SECRET_KEY"], envs: row("missing") },
];

// Mid-raid — keys minting: validating + provisioning cells pulse.
const MINTING: GridRow[] = [
  {
    provider: "Cloudflare",
    envVars: CF,
    envs: { local: "synced", dev: "validating", staging: "provisioning", prod: "missing" },
  },
  {
    provider: "Database",
    envVars: ["DATABASE_URL"],
    envs: { local: "synced", dev: "provisioning", staging: "missing", prod: "missing" },
  },
  {
    provider: "Resend",
    envVars: ["RESEND_API_KEY"],
    envs: { local: "validating", dev: "needs-consent", staging: "missing", prod: "missing" },
  },
];

// Everybody's home — all stashed and synced across every environment.
const ALL_GREEN: GridRow[] = [
  { provider: "Cloudflare", envVars: CF, envs: row("synced") },
  { provider: "Database", envVars: ["DATABASE_URL"], envs: row("synced") },
  { provider: "Resend", envVars: ["RESEND_API_KEY"], envs: row("synced") },
  { provider: "Stripe", envVars: ["STRIPE_SECRET_KEY"], envs: row("synced") },
];

// A dud + a failed run — the recovery states rendered inline.
const FAILED: GridRow[] = [
  {
    provider: "Cloudflare",
    envVars: CF,
    envs: { local: "synced", dev: "synced", staging: "failed", prod: "wrong-scope" },
  },
  {
    provider: "Database",
    envVars: ["DATABASE_URL"],
    envs: { local: "synced", dev: "failed", staging: "missing", prod: "missing" },
  },
  {
    provider: "Stripe",
    envVars: ["STRIPE_SECRET_KEY"],
    envs: { local: "validated", dev: "wrong-scope", staging: "missing", prod: "missing" },
  },
];

function row(s: GridRow["envs"]["local"]): GridRow["envs"] {
  return { local: s, dev: s, staging: s, prod: s };
}

export const Empty: Story = { name: "Empty (fresh machine)", args: { grid: EMPTY } };
export const Minting: Story = { name: "Minting (in flight)", args: { grid: MINTING } };
export const AllGreen: Story = { name: "All green (synced)", args: { grid: ALL_GREEN } };
export const Failed: Story = { name: "Failed / recovery", args: { grid: FAILED } };
