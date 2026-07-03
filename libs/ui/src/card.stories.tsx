import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Badge } from "./badge";
import { Card, Eyebrow } from "./card";
import { font } from "./tokens";

const meta = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  args: { children: null },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card style={{ width: 320 }}>
      <Eyebrow>dev · stash-pocket</Eyebrow>
      <h3 style={{ fontFamily: font.display, margin: "8px 0 4px", fontSize: "1.4rem" }}>
        cloudflare
      </h3>
      <p
        style={{
          fontFamily: font.ui,
          fontSize: 14,
          color: "var(--ink-soft)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Two keys stashed and synced across every environment.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Button size="sm">open</Button>
        <Button size="sm" variant="ghost">
          re-raid
        </Button>
      </div>
    </Card>
  ),
};

export const WithBadges: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge>MIT</Badge>
        <Badge tone="berry">local-first</Badge>
        <Badge tone="amber">no telemetry</Badge>
      </div>
    </Card>
  ),
};
