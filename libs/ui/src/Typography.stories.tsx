import type { Meta, StoryObj } from "@storybook/react";
import { font } from "./tokens";

const meta: Meta = { title: "Design System/Typography" };
export default meta;
type Story = StoryObj;

export const Scale: Story = {
  render: () => (
    <div style={{ color: "var(--ink)", maxWidth: 820 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-soft)",
        }}
      >
        01 — the axis: chunky display ↔ tight mono
      </div>

      <h1
        style={{
          fontFamily: font.display,
          fontSize: "clamp(3rem, 9vw, 5.5rem)",
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          margin: "16px 0",
        }}
      >
        raided.
      </h1>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
        Hero — Clash Display, clamp(3.5rem, 12vw, 8rem), lowercase, tight leading
      </p>

      <h2
        style={{
          fontFamily: font.display,
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          margin: "32px 0 4px",
          letterSpacing: "-0.01em",
        }}
      >
        he raids the token pages so you don't
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
        Section title — Clash Display
      </p>

      <p style={{ fontFamily: font.ui, fontSize: 17, lineHeight: 1.6, margin: "32px 0 4px" }}>
        Body copy is Satoshi, 16–18px, line-height 1.6 — warm geometric sans, friendly not
        corporate. Reads the <code style={{ fontFamily: font.mono }}>.env.example</code>, acquires
        every key, writes two places.
      </p>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
        Body — Satoshi (Inter fallback)
      </p>

      <div
        style={{
          marginTop: 32,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-md)",
          padding: 16,
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: 13, lineHeight: 1.9, color: "var(--ink)" }}>
          <div style={{ color: "var(--ink-soft)" }}>$ npx ringtail raid</div>
          <div>
            cloudflare → <span style={{ color: "var(--green)" }}>scope validated ✓</span>
          </div>
          <div>
            resend → <span style={{ color: "var(--green)" }}>scope validated ✓</span>
          </div>
          <div style={{ color: "var(--grey)" }}>sendgrid → wrong scope, skipped</div>
          <div style={{ color: "var(--green)" }}>
            ✓ wrote .env.local + Infisical (dev · staging · prod)
          </div>
        </div>
      </div>
      <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
        Mono is part of the brand — it's where the loot lives (JetBrains Mono)
      </p>
    </div>
  ),
};

export const Eyebrows: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[
        "01 — HOW HE WORKS",
        "$ NPX RINGTAIL RAID",
        "✓ SCOPE VALIDATED",
        "HE RAIDS THE TOKEN PAGES SO YOU DON'T.",
      ].map((t) => (
        <span
          key={t}
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
          }}
        >
          {t}
        </span>
      ))}
    </div>
  ),
};
