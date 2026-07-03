import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "./button";
import { Modal, modalKeyframes } from "./modal";
import { Rocco } from "./rocco";
import { font } from "./tokens";

const meta = {
  title: "Components/Modal",
  component: Modal,
  tags: ["autodocs"],
  args: { open: false, children: null },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ConsentMoment: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <style>{modalKeyframes}</style>
        <Button onClick={() => setOpen(true)}>open the consent moment</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          eyebrow="cloudflare · one allow"
          title="Click allow on Cloudflare"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                not now
              </Button>
              <Button onClick={() => setOpen(false)}>open cloudflare →</Button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Rocco pose="waving" size={72} />
            <p style={{ margin: 0, fontFamily: font.ui }}>
              Rocco needs one click to acquire your token. He drives the official Cloudflare API —
              no browser-bots. Approve once, then it's zero-touch across dev · staging · prod.
            </p>
          </div>
        </Modal>
      </>
    );
  },
};
