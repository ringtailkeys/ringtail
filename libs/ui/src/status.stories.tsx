import type { Meta, StoryObj } from "@storybook/react";
import { STATUS, StatusChip, StatusDot, type CredentialStatus } from "./status";
import { font } from "./tokens";

const ORDER: CredentialStatus[] = [
  "missing",
  "needs-consent",
  "validating",
  "validated",
  "wrong-scope",
  "provisioning",
  "synced",
];

const meta = {
  title: "Components/StatusChip",
  component: StatusChip,
  tags: ["autodocs"],
  args: { status: "synced" },
} satisfies Meta<typeof StatusChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  name: "All 7 states",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {ORDER.map((s) => (
        <div
          key={s}
          style={{
            display: "grid",
            gridTemplateColumns: "160px 40px 1fr",
            alignItems: "center",
            gap: 16,
          }}
        >
          <StatusChip status={s} />
          <StatusDot status={s} size={12} />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: STATUS[s].sacred ? "var(--green)" : "var(--ink-soft)",
            }}
          >
            {s}
            {STATUS[s].sacred ? "  ★ sacred green" : ""}
          </span>
        </div>
      ))}
    </div>
  ),
};

export const Missing: Story = { args: { status: "missing" } };
export const NeedsConsent: Story = { args: { status: "needs-consent" } };
export const Validating: Story = { args: { status: "validating" } };
export const Validated: Story = { args: { status: "validated" } };
export const WrongScope: Story = { args: { status: "wrong-scope" } };
export const Provisioning: Story = { args: { status: "provisioning" } };
export const Synced: Story = { args: { status: "synced" } };
