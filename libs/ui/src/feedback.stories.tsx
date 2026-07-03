import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton, Spinner, feedbackKeyframes } from "./feedback";
import { Card } from "./card";
import { font } from "./tokens";

const meta = {
  title: "Components/Spinner & Skeleton",
  component: Spinner,
  tags: ["autodocs"],
} satisfies Meta<typeof Spinner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Spinners: Story = {
  render: () => (
    <>
      <style>{feedbackKeyframes}</style>
      <div style={{ display: "flex", gap: 24, alignItems: "center", color: "var(--ink)" }}>
        <Spinner size={16} />
        <Spinner size={24} />
        <Spinner size={36} />
        <span style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
          rummaging… (never a breathing orb)
        </span>
      </div>
    </>
  ),
};

export const Skeletons: Story = {
  render: () => (
    <>
      <style>{feedbackKeyframes}</style>
      <Card style={{ width: 340, display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton width={140} height={20} />
        <Skeleton />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </Card>
    </>
  ),
};
