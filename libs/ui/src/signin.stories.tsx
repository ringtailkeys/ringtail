import type { Meta, StoryObj } from "@storybook/react";
import { SignInCard } from "./signin";

/**
 * The sign-in GATE — the first screen, before the ①②③ on-ramp. Passwordless email-OTP
 * against the hosted control-plane. The stories stub the network callbacks so both
 * phases (enter email → paste code) render standalone.
 */
const meta = {
  title: "Auth/SignInCard",
  component: SignInCard,
  tags: ["autodocs"],
} satisfies Meta<typeof SignInCard>;
export default meta;
type Story = StoryObj<typeof meta>;

const wait = () => new Promise<void>((r) => setTimeout(r, 400));

export const EnterEmail: Story = {
  args: {
    onSendCode: async () => wait(),
    onVerify: async () => wait(),
  },
};

export const EnterCode: Story = {
  args: {
    initialPhase: "code",
    onSendCode: async () => wait(),
    onVerify: async () => wait(),
  },
};

export const CodeRejected: Story = {
  args: {
    initialPhase: "code",
    onSendCode: async () => wait(),
    onVerify: async () => {
      await wait();
      throw new Error("that code didn't work — try again");
    },
  },
};
