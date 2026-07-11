import type { BrowserSession } from "@ringtail/core";
import { allKeyframes, cssVars, moonlit } from "@ringtail/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { BrowserHandoff } from "./BrowserHandoff";

/**
 * The browser-handoff card across its lifecycle (Increment 2). Rocco raids the provider console; the
 * human only steps in for the password wall. Every story is fed a value-free BrowserSession (the
 * shape that rides SSE) — no live daemon, no real frames (the canvas paints a stylized recorded
 * frame; a live WS would swap in real bytes without changing the card).
 */
const meta = {
  title: "Flows/BrowserHandoff",
  component: BrowserHandoff,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, padding: 24, background: "var(--bg)", minHeight: "100vh" }}>
        <style>{cssVars(moonlit)}</style>
        <style>{allKeyframes}</style>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BrowserHandoff>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = (over: Partial<BrowserSession>): BrowserSession => ({
  id: "sess1",
  provider: "openai",
  wsUrl: "ws://127.0.0.1:8800",
  state: "DRIVING",
  bubbles: [{ text: "opening platform.openai.com…" }],
  ...over,
});

// 1. DRIVING — Rocco is the cursor, gliding to the "Create new secret key" button. Frames OFF by
//    default; the bubbles narrate regardless.
export const Driving: Story = {
  args: {
    session: base({
      bubbles: [
        { text: "opening platform.openai.com…" },
        { text: "clicking “Create new secret key”…" },
      ],
    }),
  },
};

// 2. HUMAN_NEEDED — the cream→orange "your turn" moment. Frames are FORCED on (the human must see
//    the login), Rocco steps aside waving, the password page shows below (masked — never a value).
export const YourTurn: Story = {
  args: {
    session: base({
      state: "HUMAN_NEEDED",
      reason: "password",
      bubbles: [
        { text: "opening platform.openai.com…" },
        {
          text: "your turn — type your password in the panel, then click ▶ Continue",
          handoff: true,
        },
      ],
    }),
  },
};

// 3. PAUSED — same wall, waiting on the human (identical surface to HUMAN_NEEDED).
export const Paused: Story = {
  args: {
    session: base({
      state: "PAUSED",
      reason: "password",
      bubbles: [{ text: "your turn — clear the login, then ▶ Continue", handoff: true }],
    }),
  },
};

// 4. RESUMED — "got it, taking over" — Rocco is back on the cursor, the modal is minting the key.
export const Resumed: Story = {
  args: {
    session: base({
      state: "RESUMED",
      bubbles: [
        { text: "your turn — type your password…", handoff: true },
        { text: "got it — taking over from here." },
        { text: "reading the new key…" },
      ],
    }),
  },
};

// 5. MINTED — the success sweep (green), Rocco cheers. Auto-dismisses after ~5s.
export const Minted: Story = {
  args: {
    session: base({
      state: "RESUMED",
      outcome: "minted",
      bubbles: [
        { text: "reading the new key…" },
        { text: "stashed it. the agent got names, never the key." },
      ],
    }),
  },
};

// 6. FAILED — the error sweep, Rocco shakes.
export const Failed: Story = {
  args: {
    session: base({
      state: "RESUMED",
      outcome: "failed",
      bubbles: [{ text: "the console wouldn’t hand over the key — bailed, nothing stored." }],
    }),
  },
};
