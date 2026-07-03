import type { CSSProperties, ReactNode } from "react";
import { font } from "./tokens";

/**
 * Warm raised surface — a stash-pocket. `--r-md`, one soft plum-tinted shadow,
 * hairline border. Never a cold-grey enterprise card.
 */
export function Card({
  children,
  padded = true,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md, 12px)",
        boxShadow: "var(--shadow-soft)",
        color: "var(--ink)",
        padding: padded ? 20 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A mono eyebrow — `01 — HOW HE WORKS`, `$ npx ringtail raid`. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--ink-soft)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
