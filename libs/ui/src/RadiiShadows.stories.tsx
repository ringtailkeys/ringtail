import type { Meta, StoryObj } from "@storybook/react";
import { font, radius, shadow } from "./tokens";

const meta: Meta = { title: "Design System/Radii & Shadows" };
export default meta;
type Story = StoryObj;

export const Radii: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, color: "var(--ink)", flexWrap: "wrap" }}>
      {Object.entries(radius).map(([name, val]) => (
        <div key={name} style={{ textAlign: "center" }}>
          <div style={{ width: 120, height: 80, background: "var(--amber)", borderRadius: val }} />
          <code style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
            --r-{name} · {val}
          </code>
        </div>
      ))}
    </div>
  ),
};

export const Shadows: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, color: "var(--ink)", padding: 24, flexWrap: "wrap" }}>
      {Object.entries(shadow).map(([name, val]) => (
        <div key={name} style={{ textAlign: "center" }}>
          <div
            style={{
              width: 160,
              height: 100,
              background: "var(--surface)",
              borderRadius: "var(--r-md)",
              boxShadow: val,
              border: "1px solid var(--line)",
            }}
          />
          <code
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: "var(--ink-soft)",
              display: "block",
              marginTop: 12,
            }}
          >
            --shadow-{name}
          </code>
        </div>
      ))}
      <p
        style={{
          fontFamily: font.ui,
          fontSize: 13,
          color: "var(--ink-soft)",
          maxWidth: 260,
          lineHeight: 1.5,
        }}
      >
        Warm plum-tinted only. One elevation step — never stacked cold-grey shadows.
      </p>
    </div>
  ),
};
