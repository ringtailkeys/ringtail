import type { Meta, StoryObj } from "@storybook/react";
import { ActionsPanel, type ActionItem } from "./actions";

const meta = {
  title: "Cockpit/ActionsPanel",
  component: ActionsPanel,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ActionsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const ACTIONS: ActionItem[] = [
  {
    id: "neon-branch",
    title: "Neon branch per env",
    why: "Isolate dev/staging/prod data.",
    danger: "safe",
  },
  {
    id: "infisical-cf",
    title: "Wire Infisical → Cloudflare",
    why: "Sync secrets to Pages bindings.",
    danger: "safe",
  },
  {
    id: "point-domain",
    title: "Point the domain at CF",
    why: "NS swap — irreversible.",
    danger: "destructive",
  },
];

export const Mapped: Story = {
  args: { actions: ACTIONS },
  render: (args) => (
    <div style={{ width: 460 }}>
      <ActionsPanel {...args} />
    </div>
  ),
};

export const Empty: Story = {
  args: { actions: [] },
  render: (args) => (
    <div style={{ width: 460 }}>
      <ActionsPanel {...args} />
    </div>
  ),
};
