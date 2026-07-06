import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { modalKeyframes } from "./modal";
import { Rocco, roccoLine } from "./rocco";
import { font, radius } from "./tokens";

/**
 * The upgrade modal — ONE branded surface shared by the browser landing flow, `ringtail
 * up`, and the native app (DRY, lives in @ringtail/ui). It opens the DODO checkout as an
 * in-app OVERLAY (an iframe — no new tab, Apple Pay supported), and on success re-checks
 * entitlement and unlocks. Three states: `plan` (summary + CTA), `checkout` (the Dodo
 * overlay, polling for the paid flip), `success` (unlocked).
 *
 * The daemon owns the money path: `onCheckout` → POST /api/checkout → a Dodo session URL;
 * `onPollTier` → the re-checked entitlement. No secret ever flows through this component.
 */
export type UpgradeState = "plan" | "checkout" | "success";

export function UpgradeModal({
  open,
  onClose,
  onUpgraded,
  onCheckout,
  onPollTier,
  usage,
  limitReached,
  /** Storybook/tests: force a state (and skip the live checkout/poll). */
  initialState = "plan",
}: {
  open: boolean;
  onClose: () => void;
  /** Called once entitlement flips to pro → parent unlocks the cockpit. */
  onUpgraded: () => void;
  /** POST /api/checkout → the Dodo overlay session URL. */
  onCheckout: () => Promise<{ url: string }>;
  /** Re-check entitlement → the current tier (polled while the overlay is open). */
  onPollTier: () => Promise<"free" | "pro">;
  usage?: { projectsProvisioned: number; freeLimit: number };
  limitReached?: boolean;
  initialState?: UpgradeState;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<UpgradeState>(initialState);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
    if (open) setState(initialState);
  }, [open, initialState]);

  // While the Dodo overlay is open, poll entitlement — the reliable success signal.
  // ponytail: poll is the floor; a Dodo postMessage would be faster but the poll is
  // provider-agnostic and always fires. 3s cadence, stops as soon as it flips.
  useEffect(() => {
    if (state !== "checkout") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        if ((await onPollTier()) === "pro") {
          setState("success");
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (!stop) setTimeout(tick, 3000);
    };
    const id = setTimeout(tick, 3000);
    return () => {
      stop = true;
      clearTimeout(id);
    };
  }, [state, onPollTier]);

  async function startCheckout() {
    setError(null);
    try {
      const res = await onCheckout();
      setUrl(res.url);
      setState("checkout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not open checkout");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        width: state === "checkout" ? "min(560px, 100%)" : "min(440px, 100%)",
        background: "var(--surface)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: radius.md,
        boxShadow: "var(--shadow-float)",
        padding: 24,
        animation: "ringtail-rise var(--dur-base,250ms) var(--ease-snap)",
      }}
    >
      <style>{modalKeyframes}</style>

      {state === "plan" && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
            <Rocco pose="mindblown" size={72} />
            <div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ink-soft)",
                  marginBottom: 6,
                }}
              >
                {limitReached ? "free limit reached" : "go pro"}
              </div>
              <h2 style={{ fontFamily: font.display, fontSize: "1.5rem", margin: 0, letterSpacing: "-0.01em" }}>
                {limitReached ? "You've raided every free project" : "Unlimited raids"}
              </h2>
            </div>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 15, lineHeight: 1.6, margin: "0 0 8px" }}>
            {usage
              ? `Free covers ${usage.freeLimit} project${usage.freeLimit === 1 ? "" : "s"} — you've provisioned ${usage.projectsProvisioned}. `
              : ""}
            Ringtail Pro unlocks unlimited projects across every env. Same local-first raid,
            no cap. “{roccoLine("mindblown")}”
          </p>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: radius.sm,
              padding: 12,
              margin: "14px 0 4px",
              fontFamily: font.mono,
              fontSize: 13,
              color: "var(--ink-soft)",
            }}
          >
            <strong style={{ color: "var(--ink)" }}>Ringtail Pro</strong> · unlimited projects ·
            all envs · priority recipes
          </div>
          {error && (
            <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--danger, #E08A6B)", margin: "10px 0 0" }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <Button variant="ghost" onClick={onClose}>
              not now
            </Button>
            <Button onClick={() => void startCheckout()}>upgrade to Pro →</Button>
          </div>
        </>
      )}

      {state === "checkout" && (
        <>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ink-soft)",
              marginBottom: 12,
            }}
          >
            secure checkout · powered by Dodo
          </div>
          {url ? (
            <iframe
              title="Dodo checkout"
              src={url}
              allow="payment"
              style={{
                width: "100%",
                height: 480,
                border: "1px solid var(--line)",
                borderRadius: radius.sm,
                background: "#fff",
              }}
            />
          ) : (
            <p style={{ fontFamily: font.mono, fontSize: 13, color: "var(--ink-soft)" }}>
              opening the Dodo overlay…
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="ghost" onClick={onClose}>
              cancel
            </Button>
          </div>
        </>
      )}

      {state === "success" && (
        <>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
            <Rocco pose="success" animated size={72} />
            <div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--green)",
                  marginBottom: 6,
                }}
              >
                you're pro
              </div>
              <h2 style={{ fontFamily: font.display, fontSize: "1.5rem", margin: 0, letterSpacing: "-0.01em" }}>
                Unlimited unlocked
              </h2>
            </div>
          </div>
          <p style={{ fontFamily: font.ui, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            The cap's gone. Raid as many projects as you like. “{roccoLine("success")}”
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <Button
              onClick={() => {
                onUpgraded();
                onClose();
              }}
            >
              back to the raid →
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
