import { Button, Card, Eyebrow, Modal, Rocco, font } from "@ringtail/ui";

/**
 * The consent moment — the ONE human click. Rocco drives the official provider
 * API; the human clicks "allow" once (deep-linked), then it's zero-touch. No
 * browser-bots — that honesty is the trust.
 */

export function ConsentPrompt({
  provider = "cloudflare",
  onAllow,
}: {
  provider?: string;
  onAllow?: () => void;
}) {
  return (
    <Card style={{ maxWidth: 460 }}>
      <Eyebrow>{provider} · one allow</Eyebrow>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", margin: "12px 0 16px" }}>
        <Rocco pose="waving" size={72} />
        <p
          style={{
            fontFamily: font.ui,
            fontSize: 15,
            lineHeight: 1.55,
            margin: 0,
            color: "var(--ink)",
          }}
        >
          Rocco needs one click to acquire your token. Approve the scope on {provider}'s own page —
          official API, no browser-bots — then he takes it from here across dev · staging · prod.
        </p>
      </div>
      <Button onClick={onAllow}>click allow on {provider} →</Button>
    </Card>
  );
}

export function ConsentModal({
  open,
  provider = "cloudflare",
  onClose,
  onAllow,
}: {
  open: boolean;
  provider?: string;
  onClose?: () => void;
  onAllow?: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`${provider} · one allow`}
      title={`Click allow on ${provider}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            not now
          </Button>
          <Button onClick={onAllow}>open {provider} →</Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <Rocco pose="waving" size={72} />
        <p style={{ margin: 0 }}>
          One click on {provider}'s own page approves the scope. Rocco drives the official API — the
          human clicks allow once, then zero-touch. No login puppeting, ever.
        </p>
      </div>
    </Modal>
  );
}
