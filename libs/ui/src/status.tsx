import type { CSSProperties } from "react";
import { font, radius } from "./tokens";

/**
 * The credential lifecycle — the one vocabulary the whole cockpit speaks. Each
 * state maps to a point on the provisioning state machine (acquire → validate →
 * provision → sync). GREEN IS SACRED: only `validated` and `synced` earn it.
 */
export type CredentialStatus =
  | "missing"
  | "needs-consent"
  | "validating"
  | "validated"
  | "wrong-scope"
  | "provisioning"
  | "synced";

interface StatusMeta {
  /** Deadpan mono label. */
  label: string;
  /** The CSS var carrying this state's color. */
  colorVar: string;
  /** Single glyph for the dot / chip. */
  glyph: string;
  /** In-flight states pulse; resolved states are still. */
  live: boolean;
  /** The sacred green states — validated / synced only. */
  sacred?: boolean;
}

export const STATUS: Record<CredentialStatus, StatusMeta> = {
  missing: { label: "missing", colorVar: "--grey", glyph: "○", live: false },
  "needs-consent": { label: "needs consent", colorVar: "--amber-deep", glyph: "!", live: false },
  validating: { label: "validating", colorVar: "--amber", glyph: "◍", live: true },
  validated: { label: "validated", colorVar: "--green", glyph: "✓", live: false, sacred: true },
  "wrong-scope": { label: "wrong scope", colorVar: "--danger", glyph: "✗", live: false },
  provisioning: { label: "provisioning", colorVar: "--berry", glyph: "◇", live: true },
  synced: { label: "in sync", colorVar: "--green", glyph: "✓", live: false, sacred: true },
};

/** Keyframes the live dot/chip pulse relies on — mount once (Storybook/preview or App). */
export const statusKeyframes = `
@keyframes ringtail-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
@keyframes ringtail-glint {
  0% { transform: scale(1); filter: none }
  35% { transform: scale(1.35); filter: drop-shadow(0 0 6px var(--acid)) }
  100% { transform: scale(1); filter: none }
}
`;

/** A single status dot — the sacred green home, a live amber pulse, or a flat dud. */
export function StatusDot({
  status,
  size = 10,
  style,
}: {
  status: CredentialStatus;
  size?: number;
  style?: CSSProperties;
}) {
  const meta = STATUS[status];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: radius.pill,
        background: `var(${meta.colorVar})`,
        animation: meta.live
          ? "ringtail-pulse var(--dur-slow,400ms) var(--ease-effortless) infinite"
          : undefined,
        ...style,
      }}
    />
  );
}

/**
 * The status chip — dot + deadpan mono label in a soft-tinted pill. Sacred green
 * states read as "you're in"; a dud sits flat and muted.
 */
export function StatusChip({ status, style }: { status: CredentialStatus; style?: CSSProperties }) {
  const meta = STATUS[status];
  return (
    <output
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: radius.pill,
        fontFamily: font.mono,
        fontSize: 12,
        letterSpacing: "0.04em",
        color: `var(${meta.colorVar})`,
        background: `color-mix(in srgb, var(${meta.colorVar}) 12%, transparent)`,
        border: `1px solid color-mix(in srgb, var(${meta.colorVar}) 30%, transparent)`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <StatusDot status={status} size={8} />
      {meta.label}
    </output>
  );
}
