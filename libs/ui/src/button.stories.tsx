import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";

const meta = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  args: { children: "point rocco at your repo" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Ghost: Story = { args: { variant: "ghost", children: "star on github" } };
export const Danger: Story = { args: { variant: "danger", children: "flick the dud key" } };
export const Small: Story = { args: { size: "sm", children: "raid" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button variant="primary">point rocco at your repo</Button>
      <Button variant="ghost">star on github</Button>
      <Button variant="danger">flick the dud key</Button>
    </div>
  ),
};
