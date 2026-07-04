import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChatPanel, type ChatChoice, type ChatLine } from "./chat";

const meta = {
  title: "Cockpit/ChatPanel",
  component: ChatPanel,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ChatPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const THREAD: ChatLine[] = [
  {
    role: "agent",
    text: "Raided Cloudflare and stashed the token. Want me to map next actions?",
    ts: 1,
  },
  { role: "user", text: "yes, and also set up Stripe", ts: 2 },
  { role: "agent", text: "On it — added a Stripe action to the panel. Skip anything?", ts: 3 },
];

export const Empty: Story = {
  args: { messages: [] },
  render: (args) => (
    <div style={{ width: 420 }}>
      <ChatPanel {...args} />
    </div>
  ),
};

export const Conversation: Story = {
  args: { messages: THREAD },
  render: (args) => (
    <div style={{ width: 420 }}>
      <ChatPanel {...args} />
    </div>
  ),
};

export const Offline: Story = {
  args: { messages: THREAD, disabled: true },
  render: (args) => (
    <div style={{ width: 420 }}>
      <ChatPanel {...args} />
    </div>
  ),
};

const CHOICES: ChatChoice[] = [
  { id: "stripe", label: "Set up Stripe", value: "set up Stripe" },
  { id: "staging", label: "Add staging env", value: "add a staging env" },
  { id: "skip-r2", label: "Skip R2", value: "skip the R2 bucket" },
];

/** The interactive layer: "next moves" arrive as tappable pills, not a wall of text.
 * Tap one → its value posts back as a user reply and the pills lock + mark selected. */
export const WithChoices: Story = {
  args: {
    messages: [{ role: "agent", text: "Cloudflare stashed. What next?", ts: 1, choices: CHOICES }],
  },
  render: () => {
    const [msgs, setMsgs] = useState<ChatLine[]>([
      { role: "agent", text: "Cloudflare stashed. What next?", ts: 1, choices: CHOICES },
    ]);
    return (
      <div style={{ width: 420 }}>
        <ChatPanel
          messages={msgs}
          onSend={(text) => setMsgs((m) => [...m, { role: "user", text, ts: Date.now() }])}
        />
      </div>
    );
  },
};

/** Live-ish: type + Enter appends a user line (the daemon relays it for real). */
export const Interactive: Story = {
  args: { messages: [] },
  render: () => {
    const [msgs, setMsgs] = useState<ChatLine[]>(THREAD.slice(0, 1));
    return (
      <div style={{ width: 420 }}>
        <ChatPanel
          messages={msgs}
          onSend={(text) => setMsgs((m) => [...m, { role: "user", text, ts: Date.now() }])}
        />
      </div>
    );
  },
};
