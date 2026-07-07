import type { CSSProperties } from "react";

/**
 * Rocco — the night-shift bandit mascot, dropped into the docs. Background-free: the
 * transparent sticker PNG floats directly on the page (no cream tile / border / shadow),
 * with just a subtle tilt + the per-pose idle loop. Rebuilt in plain CSS because
 * @ringtail/ui is a different (React-18) build we can't import here. Static-export safe:
 * no hooks, no server APIs, just an <img> off /public/rocco. Rocco is STATIC by default —
 * no autoplay motion anywhere. The per-pose loop is gated behind :hover only (keyframes in
 * app/global.css, driven by the --rocco-loop var) and flattens under prefers-reduced-motion.
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

/** Per-pose loop (keyframes in global.css) — applied on :hover only. Undefined → no motion. */
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
  animated = true,
  caption = false,
  side = false,
  tilt = true,
  style,
}: {
  pose?: RoccoPose;
  size?: number;
  /** Subtle -2deg sticker tilt on the transparent PNG. Off for clean inline (nav). */
  tilt?: boolean;
  /** Wire the pose's loop to :hover (static at rest — never autoplays). Reduced-motion flattens it. */
  animated?: boolean;
  /** Show Rocco's deadpan line for this pose beneath the tile. */
  caption?: boolean;
  /** Float right of the prose (for contextual poses inside a page). */
  side?: boolean;
  style?: CSSProperties;
}) {
  const hoverLoop = animated ? LOOP[pose] : undefined;
  const img = (
    <img
      src={`/rocco/rocco-${pose}.png`}
      alt={`Rocco the raccoon mascot, ${pose}`}
      width={size}
      height={size}
      className={hoverLoop ? "rocco-anim" : undefined}
      style={
        {
          display: "block",
          width: size,
          height: size,
          objectFit: "contain",
          transformOrigin: "bottom center",
          // Static by default: the loop is exposed as a var and only runs on :hover (global.css).
          "--rocco-loop": hoverLoop,
        } as CSSProperties
      }
    />
  );

  // Background-free: the transparent PNG sits directly on the page. Optional subtle
  // tilt lives on a bare wrapper (no bg/border/shadow) so the idle-loop transform on
  // the <img> itself isn't clobbered.
  const sticker = tilt ? (
    <span style={{ display: "inline-block", lineHeight: 0, transform: "rotate(-2deg)" }}>
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
      {sticker}
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
