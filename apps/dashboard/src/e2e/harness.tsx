import type { MintSelection, PendingMint } from "@ringtail/core";
import { allKeyframes, cssVars, font, moonlit } from "@ringtail/ui";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectPanel } from "../cockpit/ConnectPanel";
import { PendingMints } from "../cockpit/PendingMints";
import { VendorPicker } from "../cockpit/VendorPicker";

/**
 * E2e harness — mounts the REAL compiled journey components (VendorPicker + the guided-mint
 * choice card) against REAL-SHAPE fixtures that match the daemon's SSE `choices` contract.
 * Puppeteer drives this (see e2e/drive.ts): the full live-daemon path would need an
 * MCP-authored mint + provider discovery (network) to park a choice card; per the task's
 * stated fallback we exercise the exact shipped components against fixtures instead.
 *
 * State captured to `window.__e2e` for the driver's assertions (picked vendor + the approved
 * selection). Value-free by construction — the fixture carries ids/names/labels only.
 */

// A parked GUIDED, MULTI-ROOT mint — the SSE `choices` shape (resources + narrowest-first
// permissions + suggested default + the >1 named roots the human picks WHICH to spend).
const GUIDED_MINT: PendingMint = {
  id: "m1",
  nonce: "nonce-e2e-abc",
  providerAccount: "resend",
  method: "POST /api-keys",
  varName: "RESEND_API_KEY",
  choices: {
    resources: [
      { id: "d_123", name: "acme.com" },
      { id: "d_456", name: "mail.acme.com" },
    ],
    permissions: ["sending_access", "full_access"],
    suggestedPermission: "sending_access",
    supportsExpiry: false,
    roots: [
      { id: "r_prod", provider: "resend", label: "prod", createdAt: 1 },
      { id: "r_stg", provider: "resend", label: "staging", createdAt: 2 },
    ],
  },
};

declare global {
  interface Window {
    __e2e: { picked: string | null; approved: { nonce: string; selection?: MintSelection } | null };
  }
}
window.__e2e = { picked: null, approved: null };

function Harness() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <style>{cssVars(moonlit)}</style>
      <style>{allKeyframes}</style>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--ink)",
          fontFamily: font.ui,
          padding: 40,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h2 style={{ fontFamily: font.display }}>vendor picker</h2>
          <div
            data-testid="picked"
            style={{ fontFamily: font.mono, fontSize: 12, marginBottom: 8 }}
          >
            picked: {picked ?? "—"}
          </div>
          <VendorPicker
            value={picked}
            onPick={(id) => {
              setPicked(id);
              window.__e2e.picked = id;
            }}
          />

          <h2 style={{ fontFamily: font.display, marginTop: 40 }}>connect a provider (3 modes)</h2>
          <ConnectPanel live={false} />

          <h2 style={{ fontFamily: font.display, marginTop: 40 }}>guided-mint choice card</h2>
          <PendingMints
            pending={[GUIDED_MINT]}
            onApprove={(nonce, selection) => {
              window.__e2e.approved = { nonce, selection };
            }}
          />
        </div>
      </div>
    </>
  );
}

const rootEl = document.getElementById("root") as HTMLElement;
createRoot(rootEl).render(<Harness />);
