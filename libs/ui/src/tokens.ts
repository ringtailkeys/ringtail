/**
 * @ringtail/ui tokens — the "Night Shift" system, locked in docs/brand/design-lock.md.
 * Warm & scrappy, never cold-enterprise. Green is SACRED (scope validated / synced only).
 * Consume via the CSS vars (emit with cssVars()) — never raw hex in components.
 */
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
  display: "'Clash Display', system-ui, sans-serif",
  ui: "'Satoshi', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const radius = { sm: "8px", md: "12px", pill: "999px" } as const;

export const motion = {
  easeEffortless: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeSnap: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  durQuick: "150ms",
  durBase: "250ms",
  durSlow: "400ms",
} as const;

export type Palette = typeof moonlit;

/** Emit a `:root { --bg: …; … }` block for the given theme. */
export function cssVars(theme: Palette = moonlit): string {
  const decls = Object.entries(theme)
    .map(([k, v]) => `  --${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`)
    .join("\n");
  return `:root {\n${decls}\n}`;
}
