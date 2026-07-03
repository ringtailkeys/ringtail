import type { Meta, StoryObj } from "@storybook/react";
import { Rocco, roccoLine, type RoccoPose } from "./rocco";
import { font } from "./tokens";

const POSES: RoccoPose[] = ["chill", "working", "success", "error", "mindblown", "waving"];

const meta = { title: "Components/Rocco", component: Rocco, tags: ["autodocs"] } satisfies Meta<
  typeof Rocco
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllPoses: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 24,
      }}
    >
      {POSES.map((pose) => (
        <div
          key={pose}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            color: "var(--ink)",
          }}
        >
          <Rocco pose={pose} size={140} />
          <code style={{ fontFamily: font.mono, fontSize: 12, color: "var(--amber-deep)" }}>
            {pose}
          </code>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: "var(--ink-soft)",
              textAlign: "center",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            "{roccoLine(pose)}"
          </p>
        </div>
      ))}
    </div>
  ),
};

export const Chill: Story = { args: { pose: "chill" } };
export const Working: Story = { args: { pose: "working" } };
export const Success: Story = { args: { pose: "success" } };
export const ErrorPose: Story = { name: "Error", args: { pose: "error" } };
export const Mindblown: Story = { args: { pose: "mindblown" } };
export const Waving: Story = { args: { pose: "waving" } };
export const Unframed: Story = { args: { pose: "chill", framed: false } };
