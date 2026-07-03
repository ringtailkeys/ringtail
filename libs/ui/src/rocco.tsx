import type { CSSProperties } from "react";
import chill from "./assets/rocco-chill.png";
import error from "./assets/rocco-error.png";
import mindblown from "./assets/rocco-mindblown.png";
import success from "./assets/rocco-success.png";
import waving from "./assets/rocco-waving.png";
import working from "./assets/rocco-working.png";

/**
 * Rocco — the night-shift bandit, our anti-orb. Flat sticker, bold ink outline.
 * Each pose maps to a product state (design-lock §7.5). NEVER a gradient/3D orb.
 */
export type RoccoPose = "chill" | "working" | "success" | "error" | "mindblown" | "waving";

const POSES: Record<RoccoPose, string> = {
  chill,
  working,
  success,
  error,
  mindblown,
  waving,
};

/** Deadpan captions in Rocco's voice — the pose's product meaning. */
const CAPTIONS: Record<RoccoPose, string> = {
  chill: "all stashed. i'll nap on the hoard.",
  working: "head's in the dumpster. back with your keys.",
  success: "held it to the moonlight. glows green. that one's good.",
  error: "wrong scope. dead key. flicked it.",
  mindblown: "fifteen token pages. handled. while you slept.",
  waving: "hey. i'm rocco. i raid the token pages so you don't.",
};

export function Rocco({
  pose = "chill",
  size = 120,
  framed = true,
  style,
}: {
  pose?: RoccoPose;
  size?: number;
  /** Render on a rounded die-cut sticker tile (the PNGs ship on a white ground). */
  framed?: boolean;
  style?: CSSProperties;
}) {
  const img = (
    <img
      src={POSES[pose]}
      alt={`Rocco — ${pose}`}
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, objectFit: "contain" }}
    />
  );
  if (!framed) return <span style={style}>{img}</span>;
  return (
    <span
      style={{
        display: "inline-block",
        background: "#FFFDF8",
        borderRadius: "var(--r-md, 12px)",
        border: "2px solid var(--ink)",
        boxShadow: "var(--shadow-soft)",
        padding: size * 0.06,
        lineHeight: 0,
        ...style,
      }}
    >
      {img}
    </span>
  );
}

/** The line Rocco would say for a pose — for captions / empty states. */
export function roccoLine(pose: RoccoPose): string {
  return CAPTIONS[pose];
}
