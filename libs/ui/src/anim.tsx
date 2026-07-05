import type { CSSProperties, ReactNode } from "react";

/**
 * Shared motion primitives — the ONE spring vocabulary the whole app moves with.
 * Pure CSS keyframes on the design-lock's spring easing (`--ease-snap`, the gen-z
 * overshoot) — NO motion library, no per-shell fork. Both shells (browser `ringtail
 * up` and the native Tauri app) load the same dashboard, so this is where all the
 * "cards rise in, pills pop, Rocco reacts" polish lives. Accessible by default:
 * `prefers-reduced-motion: reduce` flattens every `.ringtail-anim` to its rest state.
 */

/** The reveal kinds — pick the one that fits the element's arrival. */
export type AnimKind = "rise" | "pop" | "wave" | "cheer" | "shake" | "float";

/** Every element that animates carries this class so reduced-motion can disable it. */
export const ANIM_CLASS = "ringtail-anim";

/** The spring the whole system settles on (matches tokens.motion.easeSnap). */
const SPRING = "var(--ease-snap, cubic-bezier(0.34, 1.56, 0.64, 1))";

/** Keyframes + the reduced-motion guard. Folded into `allKeyframes` (mount once). */
export const animKeyframes = `
@keyframes ringtail-rise {
  from { opacity: 0; transform: translateY(14px) }
  to   { opacity: 1; transform: translateY(0) }
}
@keyframes ringtail-pop {
  0%   { opacity: 0; transform: scale(.9) }
  60%  { opacity: 1; transform: scale(1.04) }
  100% { opacity: 1; transform: scale(1) }
}
@keyframes ringtail-wave {
  0%,100% { transform: rotate(0deg) }
  20% { transform: rotate(-9deg) }
  40% { transform: rotate(11deg) }
  60% { transform: rotate(-6deg) }
  80% { transform: rotate(4deg) }
}
@keyframes ringtail-cheer {
  0%,100% { transform: translateY(0) scale(1) }
  30% { transform: translateY(-10px) scale(1.05) }
  60% { transform: translateY(0) scale(1) }
}
@keyframes ringtail-shake {
  0%,100% { transform: translateX(0) rotate(0) }
  20% { transform: translateX(-5px) rotate(-3deg) }
  40% { transform: translateX(5px) rotate(3deg) }
  60% { transform: translateX(-4px) rotate(-2deg) }
  80% { transform: translateX(4px) rotate(2deg) }
}
@keyframes ringtail-float {
  0%,100% { transform: translateY(0) }
  50% { transform: translateY(-5px) }
}
@media (prefers-reduced-motion: reduce) {
  .${ANIM_CLASS} { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`;

/**
 * The inline style for a one-shot reveal — spread onto ANY element (div, tr, span),
 * so a table row and a card share the exact same spring. `both` holds frame 0 before
 * the delay (no flash of final state) and frame 100 after. Pair with `ANIM_CLASS`.
 */
export function revealStyle(delay = 0, kind: AnimKind = "rise"): CSSProperties {
  return {
    animation: `ringtail-${kind} var(--dur-slow, 400ms) ${SPRING} both`,
    animationDelay: `${delay}ms`,
  };
}

/**
 * Convenience wrapper for block content (cards, panels, the stepper). For rows/cells
 * that can't take a wrapping div, spread `revealStyle()` + `className={ANIM_CLASS}`
 * directly instead — same motion, no extra element.
 */
export function Reveal({
  children,
  delay = 0,
  kind = "rise",
  style,
}: {
  children: ReactNode;
  delay?: number;
  kind?: AnimKind;
  style?: CSSProperties;
}) {
  return (
    <div className={ANIM_CLASS} style={{ ...revealStyle(delay, kind), ...style }}>
      {children}
    </div>
  );
}
