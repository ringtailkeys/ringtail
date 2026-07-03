import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "MIT" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TrustRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Badge>MIT</Badge>
      <Badge tone="berry">local-first</Badge>
      <Badge tone="amber">no telemetry</Badge>
      <Badge tone="acid">open source</Badge>
    </div>
  ),
};

export const Neutral: Story = { args: { tone: "neutral", children: "MIT" } };
export const Amber: Story = { args: { tone: "amber", children: "no telemetry" } };
export const Berry: Story = { args: { tone: "berry", children: "local-first" } };
export const Acid: Story = { args: { tone: "acid", children: "open source" } };
