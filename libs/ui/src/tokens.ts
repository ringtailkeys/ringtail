/**
 * @ringtail/ui tokens — the "Night Shift" system, locked in docs/brand/design-lock.md.
 * Warm & scrappy, never cold-enterprise. Green is SACRED (scope validated / synced only).
 * Consume via the CSS vars (cssVars() / cssVarStyle()) — never raw hex in components.
 */
import type { CSSProperties } from "react";

export const moonlit = {
  bg: "#F6EDDD",
  surface: "#FCF6EC",
  ink: "#211A1E",
  inkSoft: "#6E5E52",
  amber: "#F5A524",
  amberDeep: "#D6851A",
  grey: "#AA9D8C",
  acid: "#E8FF4B",
  hot: "#FF5C8A",
  green: "#37B27E",
  berry: "#8A3A63",
  line: "#E4D8C4",
  danger: "#C0432E",
} as const;

export const graveyard = {
  bg: "#17110F",
  surface: "#211A1E",
  ink: "#F6EDDD",
  inkSoft: "#AA9D8C",
  amber: "#F5A524",
  amberDeep: "#D6851A",
  grey: "#AA9D8C",
  acid: "#E8FF4B",
  hot: "#FF5C8A",
  green: "#37B27E",
  berry: "#8A3A63",
  line: "#33262A",
  danger: "#C0432E",
} as const;

export const font = {
  display: "'Clash Display', 'Satoshi', system-ui, sans-serif",
  ui: "'Satoshi', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', monospace",
} as const;

export const radius = { sm: "8px", md: "12px", pill: "999px" } as const;

/** Warm plum-tinted elevation — one step, never stacked cold-grey. */
export const shadow = {
  soft: "0 8px 24px -10px rgba(33,26,30,.20)",
  float: "0 20px 44px -20px rgba(33,26,30,.28)",
} as const;

/** 4px base spacing scale. */
export const space = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "40px",
  xxl: "64px",
} as const;

export const motion = {
  easeEffortless: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeSnap: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  durQuick: "150ms",
  durBase: "250ms",
  durSlow: "400ms",
} as const;

/** A theme's color set — same token keys as `moonlit`, values as hex strings. */
export type Palette = Record<keyof typeof moonlit, string>;

const kebab = (k: string): string => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The palette + font/radius/motion/shadow custom-property pairs for a theme. */
function tokenPairs(theme: Palette): Array<[string, string]> {
  return [
    ...Object.entries(theme).map(([k, v]) => [`--${kebab(k)}`, v] as [string, string]),
    ["--font-display", font.display],
    ["--font-ui", font.ui],
    ["--font-mono", font.mono],
    ["--r-sm", radius.sm],
    ["--r-md", radius.md],
    ["--r-pill", radius.pill],
    ["--shadow-soft", shadow.soft],
    ["--shadow-float", shadow.float],
    ["--ease-effortless", motion.easeEffortless],
    ["--ease-snap", motion.easeSnap],
    ["--dur-quick", motion.durQuick],
    ["--dur-base", motion.durBase],
    ["--dur-slow", motion.durSlow],
  ];
}

/** Emit a `selector { --bg: …; … }` block for the given theme (for a <style> tag). */
export function cssVars(theme: Palette = moonlit, selector = ":root"): string {
  const decls = tokenPairs(theme)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${decls}\n}`;
}

/** The same tokens as an inline `style` object — scope a theme to one subtree. */
export function cssVarStyle(theme: Palette = moonlit): CSSProperties {
  return Object.fromEntries(tokenPairs(theme)) as CSSProperties;
}
