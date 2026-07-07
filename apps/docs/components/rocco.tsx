import type { CSSProperties } from "react";

/**
 * Rocco — the night-shift bandit mascot, dropped into the docs. Flat sticker PNG on a
 * cream die-cut tile, thin accent border, soft shadow, slight tilt — mirrors the framed
 * treatment from libs/ui/src/rocco.tsx, rebuilt in plain CSS because @ringtail/ui is a
 * different (React-18) build we can't import here. Static-export safe: no hooks, no
 * server APIs, just an <img> off /public/rocco. Idle loops live in app/global.css and
 * flatten under prefers-reduced-motion.
 */
export type RoccoPose = "chill" | "working" | "success" | "error" | "mindblown" | "waving";

/** Deadpan captions in Rocco's voice — each pose's product meaning (from rocco.tsx). */
const CAPTIONS: Record<RoccoPose, string> = {
  chill: "all stashed. i'll nap on the hoard.",
  working: "head's in the dumpster. back with your keys.",
  success: "held it to the moonlight. glows green. that one's good.",
  error: "wrong scope. dead key. flicked it.",
  mindblown: "fifteen token pages. handled. while you slept.",
  waving: "hey. i'm rocco. i raid the token pages so you don't.",
};

/** Idle loop per pose (keyframes in global.css). Undefined → no motion. */
const LOOP: Partial<Record<RoccoPose, string>> = {
  waving: "rocco-wave 2.6s ease infinite",
  success: "rocco-cheer 2.4s ease infinite",
  error: "rocco-shake 2.8s ease infinite",
  working: "rocco-float 3s ease-in-out infinite",
  chill: "rocco-float 4s ease-in-out infinite",
  mindblown: "rocco-float 3.4s ease-in-out infinite",
};

export function Rocco({
  pose = "chill",
  size = 116,
  framed = true,
  animated = true,
  caption = false,
  side = false,
  style,
}: {
  pose?: RoccoPose;
  size?: number;
  /** Cream die-cut tile with accent border + soft shadow + slight tilt. */
  framed?: boolean;
  /** Run the pose's idle loop (wave/cheer/shake/float). Reduced-motion flattens it. */
  animated?: boolean;
  /** Show Rocco's deadpan line for this pose beneath the tile. */
  caption?: boolean;
  /** Float right of the prose (for contextual poses inside a page). */
  side?: boolean;
  style?: CSSProperties;
}) {
  const img = (
    <img
      src={`/rocco/rocco-${pose}.png`}
      alt={`Rocco the raccoon mascot, ${pose}`}
      width={size}
      height={size}
      className={animated ? "rocco-anim" : undefined}
      style={{
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
        transformOrigin: "bottom center",
        animation: animated ? LOOP[pose] : undefined,
      }}
    />
  );

  const tile = framed ? (
    <span
      style={{
        display: "inline-block",
        background: "#fffdf8",
        borderRadius: 14,
        border: "2px solid var(--color-fd-primary)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.14)",
        padding: Math.round(size * 0.06),
        lineHeight: 0,
        transform: "rotate(-2deg)",
      }}
    >
      {img}
    </span>
  ) : (
    img
  );

  const wrapStyle: CSSProperties = side
    ? { float: "right", margin: "0.25rem 0 1rem 1.25rem", textAlign: "center", ...style }
    : {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        margin: "1.5rem 0",
        ...style,
      };

  return (
    <span style={{ ...wrapStyle, maxWidth: caption ? size + 40 : undefined }}>
      {tile}
      {caption && (
        <span
          style={{
            fontSize: "0.8rem",
            fontStyle: "italic",
            color: "var(--color-fd-muted-foreground)",
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {CAPTIONS[pose]}
        </span>
      )}
    </span>
  );
}
