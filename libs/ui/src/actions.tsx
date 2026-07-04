import type { CSSProperties } from "react";
import { Badge } from "./badge";
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
}

const DANGER_LABEL: Record<ActionItem["danger"], string> = {
  safe: "auto",
  confirm: "confirm",
  destructive: "destructive",
};

export function ActionsPanel({ actions, style }: { actions: ActionItem[]; style?: CSSProperties }) {
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
            <div
              key={a.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: radius.md,
                boxShadow: "var(--shadow-soft)",
                padding: "14px 16px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--ink)" }}>
                  {a.title}
                </div>
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
              </div>
              <Badge tone={a.danger === "safe" ? "neutral" : "amber"}>
                {DANGER_LABEL[a.danger]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
