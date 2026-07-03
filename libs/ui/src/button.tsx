import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { moonlit, radius } from "./tokens";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = solid amber (the CTA); ghost = hairline outline. */
  variant?: "primary" | "ghost";
}

/**
 * Ringtail CTA. Amber solid with INK text (amber's light enough for dark text —
 * higher contrast + friendlier than white-on-amber, per the design lock).
 */
export function Button({ variant = "primary", style, ...rest }: ButtonProps) {
  const base: CSSProperties = {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 14,
    padding: "10px 16px",
    borderRadius: radius.sm,
    cursor: "pointer",
    transition: "transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  };
  const variants: Record<NonNullable<ButtonProps["variant"]>, CSSProperties> = {
    primary: {
      background: `var(--amber, ${moonlit.amber})`,
      color: `var(--ink, ${moonlit.ink})`,
      border: "none",
    },
    ghost: {
      background: "transparent",
      color: `var(--ink, ${moonlit.ink})`,
      border: `1px solid var(--line, ${moonlit.line})`,
    },
  };
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }} />;
}
