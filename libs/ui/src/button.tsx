import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { useState } from "react";
import { moonlit, radius } from "./tokens";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = solid amber (the CTA); ghost = hairline outline; danger = warm brick. */
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}

/**
 * Ringtail CTA. Amber solid with INK text (amber's light enough for dark text —
 * higher contrast + friendlier than white-on-amber, per the design lock). Hover
 * = a `--ease-snap` micro-lift (the gen-z bounce).
 */
export function Button({ variant = "primary", size = "md", style, ...rest }: ButtonProps) {
  const [hover, setHover] = useState(false);
  const base: CSSProperties = {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: size === "sm" ? 13 : 14,
    fontWeight: 500,
    padding: size === "sm" ? "7px 12px" : "10px 16px",
    borderRadius: radius.sm,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    transition:
      "transform var(--dur-quick,150ms) var(--ease-snap), background var(--dur-quick,150ms) ease",
    transform: hover ? "translateY(-2px)" : "none",
  };
  const variants: Record<NonNullable<ButtonProps["variant"]>, CSSProperties> = {
    primary: {
      background: hover
        ? `var(--amber-deep, ${moonlit.amberDeep})`
        : `var(--amber, ${moonlit.amber})`,
      color: `var(--ink, ${moonlit.ink})`,
      border: "none",
    },
    ghost: {
      background: hover ? "color-mix(in srgb, var(--ink) 6%, transparent)" : "transparent",
      color: `var(--ink, ${moonlit.ink})`,
      border: `1px solid var(--line, ${moonlit.line})`,
    },
    danger: {
      background: hover
        ? "color-mix(in srgb, var(--danger) 84%, black)"
        : `var(--danger, ${moonlit.danger})`,
      color: "#FCF6EC",
      border: "none",
    },
  };
  return (
    <button
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}
    />
  );
}
