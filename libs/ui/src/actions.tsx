import { type CSSProperties, useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { font, radius } from "./tokens";

/**
 * ActionsPanel — the LIVING layer-2 list (architecture.md §"Map the actions" +
 * §"Directable actions"). The repo-specific next steps the agent mapped: a Neon
 * branch per env, wire Infisical → CF, create the R2 bucket your code references.
 * NOT fixed — the user steers it in chat ("also set up Stripe" / "skip X") and the
 * agent re-renders this panel live over SSE. Value-free: titles + reasons + danger.
 *
 * Structural props (not core's Action) so @ringtail/ui stays engine-free.
 */
export interface ActionItem {
  id: string;
  title: string;
  why: string;
  danger: "safe" | "confirm" | "destructive";
  /** Providers/steps that must be in place first (a provider id is gated by the daemon). */
  prerequisites?: string[];
}

const DANGER_LABEL: Record<ActionItem["danger"], string> = {
  safe: "auto",
  confirm: "confirm",
  destructive: "destructive",
};

/** Approve a mapped action. `confirmed` is true only once a destructive action has
 * cleared the two-step gate below — the UI half of the hard-confirm (the daemon
 * enforces the other half: it refuses a destructive run without confirmed). */
export type ApproveFn = (id: string, confirmed: boolean) => void;

export function ActionsPanel({
  actions,
  onApprove,
  style,
}: {
  actions: ActionItem[];
  onApprove?: ApproveFn;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
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
        next actions {actions.length > 0 ? `· ${actions.length}` : ""}
      </div>
      {actions.length === 0 ? (
        <p style={{ fontFamily: font.ui, fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
          nothing mapped yet — ask the agent to set something up.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} onApprove={onApprove} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action: a, onApprove }: { action: ActionItem; onApprove?: ApproveFn }) {
  // Two-step hard-confirm for a destructive action (NS swap, delete) — never one-click.
  const [confirming, setConfirming] = useState(false);

  function approve() {
    if (!onApprove) return;
    if (a.danger === "destructive" && !confirming) {
      setConfirming(true); // first click arms; second click confirms
      return;
    }
    onApprove(a.id, a.danger === "destructive"); // confirmed only for the destructive path
    setConfirming(false);
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${confirming ? "var(--danger)" : "var(--line)"}`,
        borderRadius: radius.md,
        boxShadow: "var(--shadow-soft)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--ink)" }}>{a.title}</div>
        <div
          style={{
            fontFamily: font.ui,
            fontSize: 13,
            color: "var(--ink-soft)",
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {a.why}
        </div>
        {a.prerequisites && a.prerequisites.length > 0 && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: "var(--ink-soft)",
              marginTop: 6,
            }}
          >
            needs: {a.prerequisites.join(" · ")}
          </div>
        )}
        {confirming && (
          <div
            style={{ fontFamily: font.mono, fontSize: 11, color: "var(--danger)", marginTop: 8 }}
          >
            ⚠ destructive — cuts over live state. click confirm to proceed.
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <Badge tone={a.danger === "safe" ? "neutral" : "amber"}>{DANGER_LABEL[a.danger]}</Badge>
        {onApprove && (
          <Button
            size="sm"
            variant={confirming ? "danger" : a.danger === "destructive" ? "ghost" : "primary"}
            onClick={approve}
          >
            {confirming ? "confirm swap" : a.danger === "safe" ? "approve" : "review"}
          </Button>
        )}
      </div>
    </div>
  );
}
