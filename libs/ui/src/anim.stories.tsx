import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ANIM_CLASS, Reveal, revealStyle, type AnimKind } from "./anim";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Rocco, type RoccoPose } from "./rocco";
import { font } from "./tokens";

/**
 * The shared spring-motion primitives — the ONE vocabulary both shells move with
 * (browser `ringtail up` + the native Tauri app load the same dashboard). Pure CSS
 * on the design-lock easing, reduced-motion safe. Hit "replay" to re-trigger the
 * reveal springs (they fire once on mount).
 */
const meta = { title: "Design System/Motion Primitives" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const KINDS: AnimKind[] = ["rise", "pop"];
const POSES: RoccoPose[] = ["waving", "success", "error", "working", "chill", "mindblown"];

function Replayable({ children }: { children: (k: number) => React.ReactNode }) {
  const [k, setK] = useState(0);
  return (
    <div style={{ display: "grid", gap: 20, justifyItems: "start" }}>
      <Button variant="ghost" size="sm" onClick={() => setK((n) => n + 1)}>
        ↻ replay
      </Button>
      <div key={k}>{children(k)}</div>
    </div>
  );
}

// Each reveal kind, labeled — the entrance springs cards/pills/panels use.
export const RevealKinds: Story = {
  render: () => (
    <Replayable>
      {() => (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {KINDS.map((kind, i) => (
            <div key={kind} className={ANIM_CLASS} style={revealStyle(i * 120, kind)}>
              <Card style={{ width: 180 }}>
                <div style={{ fontFamily: font.display, fontSize: 20 }}>{kind}</div>
                <code style={{ fontFamily: font.mono, fontSize: 12, color: "var(--amber-deep)" }}>
                  revealStyle(_, "{kind}")
                </code>
              </Card>
            </div>
          ))}
        </div>
      )}
    </Replayable>
  ),
};

// A staggered cascade — rows land one after another (the grid / panels arrival).
export const StaggeredReveal: Story = {
  render: () => (
    <Replayable>
      {() => (
        <div style={{ display: "grid", gap: 10, width: 320 }}>
          {["cloudflare", "database", "resend", "stripe", "sendgrid"].map((p, i) => (
            <Reveal key={p} delay={i * 90}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-md)",
                  background: "var(--surface)",
                }}
              >
                <Badge tone="berry">{i + 1}</Badge>
                <span style={{ fontFamily: font.ui, fontWeight: 600 }}>{p}</span>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </Replayable>
  ),
};

// Rocco's idle loops, alive — waving on connect, cheering on green, shaking on fail.
export const AnimatedRocco: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 24,
      }}
    >
      {POSES.map((pose) => (
        <div
          key={pose}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <Rocco pose={pose} animated size={120} />
          <code style={{ fontFamily: font.mono, fontSize: 12, color: "var(--amber-deep)" }}>
            {pose}
          </code>
        </div>
      ))}
    </div>
  ),
};
