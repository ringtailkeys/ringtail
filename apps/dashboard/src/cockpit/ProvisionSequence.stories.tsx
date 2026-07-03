import type { Meta, StoryObj } from "@storybook/react";
import { ProvisionSequence } from "./ProvisionSequence";

const meta = { title: "Flows/Provision Sequence", component: ProvisionSequence } satisfies Meta<
  typeof ProvisionSequence
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TheRaid: Story = {
  name: "acquire → validate → provision → sync",
  render: () => <ProvisionSequence />,
};
