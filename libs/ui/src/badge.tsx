import type { CSSProperties, ReactNode } from "react";
import { font } from "./tokens";

/**
 * The trust badges — MIT / local-first / no-telemetry. Mono pill, hairline
 * border, muted by default. `tone="acid"` for the loud one; green stays SACRED
 * so it is NOT a badge tone.
 */
export function Badge({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: "neutral" | "amber" | "acid" | "berry";
  style?: CSSProperties;
}) {
  const tones: Record<string, CSSProperties> = {
    neutral: { color: "var(--ink-soft)", borderColor: "var(--line)", background: "transparent" },
    amber: {
      color: "var(--amber-deep)",
      borderColor: "color-mix(in srgb, var(--amber) 40%, transparent)",
      background: "color-mix(in srgb, var(--amber) 12%, transparent)",
    },
    acid: {
      color: "var(--ink)",
      borderColor: "color-mix(in srgb, var(--acid) 60%, var(--ink))",
      background: "var(--acid)",
    },
    berry: {
      color: "var(--berry)",
      borderColor: "color-mix(in srgb, var(--berry) 40%, transparent)",
      background: "color-mix(in srgb, var(--berry) 10%, transparent)",
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--r-pill, 999px)",
        border: "1px solid",
        fontFamily: font.mono,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
