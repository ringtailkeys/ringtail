import type { CSSProperties } from "react";

/**
 * Rummage spinner — a warm amber arc, NOT a breathing orb (banned). Use sparingly;
 * skeletons and Rocco's "rummaging" loop are the preferred loading surface.
 */
export function Spinner({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  return (
    <output
      aria-label="loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(2, size / 10)}px solid color-mix(in srgb, var(--amber) 25%, transparent)`,
        borderTopColor: "var(--amber)",
        animation: "ringtail-spin 700ms linear infinite",
        ...style,
      }}
    />
  );
}

/** Keyframes the Spinner and Skeleton rely on — mount once (preview/App). */
export const feedbackKeyframes = `
@keyframes ringtail-spin { to { transform: rotate(360deg) } }
@keyframes ringtail-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
`;

/** Warm shimmer placeholder — the preferred loading surface over spinners. */
export function Skeleton({
  width = "100%",
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width,
        height,
        borderRadius: "var(--r-sm, 8px)",
        background:
          "linear-gradient(90deg, color-mix(in srgb, var(--ink) 6%, transparent) 25%, color-mix(in srgb, var(--ink) 12%, transparent) 37%, color-mix(in srgb, var(--ink) 6%, transparent) 63%)",
        backgroundSize: "200% 100%",
        animation: "ringtail-shimmer 1.4s ease infinite",
        ...style,
      }}
    />
  );
}
