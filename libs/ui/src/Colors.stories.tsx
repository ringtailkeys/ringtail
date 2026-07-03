import type { Meta, StoryObj } from "@storybook/react";
import { font, graveyard, moonlit, type Palette } from "./tokens";

const ROLE: Record<string, string> = {
  bg: "page ground — warm moonlit paper, never white/blue-grey",
  surface: "cards / stash-pockets",
  ink: "primary text + the mask — warm plum-black",
  inkSoft: "secondary / muted taupe",
  amber: "PRIMARY brand + CTA — the glint on a stolen key",
  amberDeep: "CTA hover / pressed / depth",
  grey: "warm taupe neutral · dud / expired keys",
  acid: "acid moonlight FLASH — loud but sparse",
  hot: "hot jolt — links, active, Rocco's blush",
  green: "SACRED — scope validated / key works / synced ONLY",
  berry: "nocturnal depth / section breaks",
  line: "warm hairline borders",
  danger: "errors — warm brick, never fire-truck red",
};

function Swatches({ palette }: { palette: Palette }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
        gap: 12,
      }}
    >
      {Object.entries(palette).map(([name, hex]) => {
        const sacred = name === "green";
        return (
          <div
            key={name}
            style={{
              border: sacred ? "2px solid var(--green)" : "1px solid var(--line)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <div style={{ height: 64, background: hex }} />
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontFamily: font.mono, fontSize: 13, color: "var(--ink)" }}>
                --{name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}
                {sacred && " ★"}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                {hex}
              </div>
              <div
                style={{
                  fontFamily: font.ui,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {ROLE[name]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const meta: Meta = { title: "Design System/Colors" };
export default meta;
type Story = StoryObj;

export const Moonlit: Story = {
  name: "Moonlit (light)",
  render: () => <Swatches palette={moonlit} />,
};

export const Graveyard: Story = {
  name: "Graveyard (dark)",
  render: () => <Swatches palette={graveyard} />,
  globals: { theme: "dark" },
};

export const SacredGreen: Story = {
  name: "The sacred green",
  render: () => (
    <div style={{ maxWidth: 520, fontFamily: font.ui, color: "var(--ink)", lineHeight: 1.6 }}>
      <p style={{ marginTop: 0 }}>
        One color carries all the "it worked" weight.{" "}
        <code style={{ fontFamily: font.mono }}>--green</code> means{" "}
        <strong>scope validated / key works / synced</strong> — full stop. Spend it once, mean it.
      </p>
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        <span style={{ fontFamily: font.mono, color: "var(--green)" }}>
          stripe → scope validated ✓
        </span>
        <span
          style={{ fontFamily: font.mono, color: "var(--grey)", textDecoration: "line-through" }}
        >
          sendgrid → wrong scope
        </span>
      </div>
    </div>
  ),
};
