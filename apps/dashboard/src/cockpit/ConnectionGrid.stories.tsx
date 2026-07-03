import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConnectionGrid } from "./ConnectionGrid";
import { ALL_GREEN, EMPTY, MIXED, type Env } from "./fixtures";

const meta = {
  title: "Flows/Connection Grid",
  component: ConnectionGrid,
  args: { providers: EMPTY },
} satisfies Meta<typeof ConnectionGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  name: "Empty (fresh · all missing)",
  render: () => <ConnectionGrid providers={EMPTY} />,
};

export const Mixed: Story = {
  name: "Mixed (synced · needs-consent · validating · wrong-scope)",
  render: () => {
    const [env, setEnv] = useState<Env | undefined>(undefined);
    return (
      <ConnectionGrid
        providers={MIXED}
        activeEnv={env}
        onEnv={(e) => setEnv(e === env ? undefined : e)}
      />
    );
  },
};

export const AllGreen: Story = {
  name: "All Green (synced across dev · staging · prod)",
  render: () => <ConnectionGrid providers={ALL_GREEN} />,
};

export const Loading: Story = {
  render: () => <ConnectionGrid providers={MIXED} state="loading" />,
};
export const Error: Story = { render: () => <ConnectionGrid providers={MIXED} state="error" /> };
