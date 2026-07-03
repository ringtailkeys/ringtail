import { Button, modalKeyframes } from "@ringtail/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConsentModal, ConsentPrompt } from "./Consent";

const meta = { title: "Flows/Consent", component: ConsentPrompt } satisfies Meta<
  typeof ConsentPrompt
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = { render: () => <ConsentPrompt provider="cloudflare" /> };

export const ModalMoment: Story = {
  name: "Consent Modal",
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <style>{modalKeyframes}</style>
        <Button onClick={() => setOpen(true)}>open the consent moment</Button>
        <ConsentModal
          open={open}
          provider="cloudflare"
          onClose={() => setOpen(false)}
          onAllow={() => setOpen(false)}
        />
      </>
    );
  },
};
