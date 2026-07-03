import type { Meta, StoryObj } from "@storybook/react";
import { font, motion } from "./tokens";

const meta: Meta = { title: "Design System/Motion" };
export default meta;
type Story = StoryObj;

function Row({ name, value, desc }: { name: string; value: string; desc: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 16,
        alignItems: "baseline",
        padding: "10px 0",
        borderTop: "1px solid var(--line)",
      }}
    >
      <code style={{ fontFamily: font.mono, fontSize: 13, color: "var(--amber-deep)" }}>
        {name}
      </code>
      <div>
        <div style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink)" }}>{value}</div>
        <div style={{ fontFamily: font.ui, fontSize: 13, color: "var(--ink-soft)" }}>{desc}</div>
      </div>
    </div>
  );
}

export const Tokens: Story = {
  render: () => (
    <div style={{ maxWidth: 720, color: "var(--ink)" }}>
      <Row
        name="--ease-effortless"
        value={motion.easeEffortless}
        desc="default — smooth confident landing"
      />
      <Row
        name="--ease-snap"
        value={motion.easeSnap}
        desc="the gen-z bounce — hovers, chips, the tail-flick"
      />
      <Row name="--dur-quick" value={motion.durQuick} desc="hover, focus" />
      <Row name="--dur-base" value={motion.durBase} desc="most transitions" />
      <Row
        name="--dur-slow"
        value={motion.durSlow}
        desc="reveals, the key-validated glint, the sort"
      />
    </div>
  ),
};

export const TheGlint: Story = {
  name: "Signature — the glint",
  render: () => (
    <div style={{ color: "var(--ink)" }}>
      <p style={{ fontFamily: font.ui, maxWidth: 480, lineHeight: 1.6 }}>
        When a scope validates the key flashes acid moonlight for one frame, then settles to sacred
        green. The product's hero moment. Hover the key.
      </p>
      <style>{`.rt-glint:hover { animation: rt-glint-demo 500ms var(--ease-effortless); }
        @keyframes rt-glint-demo { 0% { color: var(--amber); transform: scale(1) }
        35% { color: var(--acid); transform: scale(1.4); text-shadow: 0 0 12px var(--acid) }
        100% { color: var(--green); transform: scale(1) } }`}</style>
      <div
        className="rt-glint"
        style={{
          fontSize: 72,
          width: 96,
          textAlign: "center",
          color: "var(--green)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        🔑
      </div>
    </div>
  ),
};

export const Ease: Story = {
  name: "Ease comparison (hover)",
  render: () => (
    <div style={{ display: "flex", gap: 40, color: "var(--ink)" }}>
      {[
        { label: "effortless", ease: motion.easeEffortless },
        { label: "snap", ease: motion.easeSnap },
      ].map(({ label, ease }) => (
        <div key={label}>
          <style>{`.rt-ease-${label}:hover { transform: translateX(60px); }`}</style>
          <div
            className={`rt-ease-${label}`}
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--r-sm)",
              background: "var(--amber)",
              transition: `transform 600ms ${ease}`,
            }}
          />
          <code style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
            {label}
          </code>
        </div>
      ))}
    </div>
  ),
};
