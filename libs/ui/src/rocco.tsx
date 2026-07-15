import type { CSSProperties } from "react";
import { ANIM_CLASS } from "./anim";
import chill from "./assets/rocco-chill.png";
import error from "./assets/rocco-error.png";
import heroPoster from "./assets/rocco-hero-poster.png";
import heroWebp from "./assets/rocco-hero.webp";
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

/** Each pose's living loop — a subtle, on-brand idle so Rocco reacts to product state
 * (waving on connect, cheering when a cell goes green, shaking on a failure). Gentle
 * amplitudes; `prefers-reduced-motion` flattens them (via ANIM_CLASS). */
const LOOP: Partial<Record<RoccoPose, string>> = {
  waving: "ringtail-wave 2.4s var(--ease-effortless, ease) infinite",
  success: "ringtail-cheer 2.2s var(--ease-effortless, ease) infinite",
  error: "ringtail-shake 2.6s var(--ease-effortless, ease) infinite",
  working: "ringtail-float 3s ease-in-out infinite",
  chill: "ringtail-float 4s ease-in-out infinite",
  mindblown: "ringtail-float 3.4s ease-in-out infinite",
};

export function Rocco({
  pose = "chill",
  size = 120,
  framed = true,
  animated = false,
  hero = false,
  style,
}: {
  pose?: RoccoPose;
  size?: number;
  /** Render on a rounded die-cut sticker tile (the PNGs ship on a white ground). */
  framed?: boolean;
  /** Bring the pose alive with its idle loop (waving/cheer/shake/float). */
  animated?: boolean;
  /** Swap to the always-looping transparent-alpha WebP (waving + breathing + blink) —
   *  no card, sits straight on the page ground. `prefers-reduced-motion` falls back to
   *  the static poster PNG (both handled below). Ignores `pose`/`framed`/`animated`. */
  hero?: boolean;
  style?: CSSProperties;
}) {
  if (hero) {
    return (
      <span style={{ display: "inline-block", width: size, height: size, lineHeight: 0, ...style }}>
        <img
          src={heroWebp}
          alt="Rocco, the Ringtail mascot, waving"
          width={size}
          height={size}
          className="rocco-hero-anim"
          style={{ display: "block", width: size, height: size, objectFit: "contain" }}
        />
        <img
          src={heroPoster}
          alt="Rocco, the Ringtail mascot, waving"
          width={size}
          height={size}
          className="rocco-hero-poster"
          style={{ display: "none", width: size, height: size, objectFit: "contain" }}
        />
      </span>
    );
  }

  const img = (
    <img
      src={POSES[pose]}
      alt={`Rocco — ${pose}`}
      width={size}
      height={size}
      className={animated ? ANIM_CLASS : undefined}
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
