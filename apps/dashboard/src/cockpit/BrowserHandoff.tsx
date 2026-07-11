import type { BrowserSession } from "@ringtail/core";
import {
  ANIM_CLASS,
  Badge,
  Button,
  Rocco,
  type RoccoPose,
  font,
  moonlit,
  radius,
} from "@ringtail/ui";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { mapToPageCss } from "./browser-frame";

/**
 * BROWSER HANDOFF — the live-view card for a browser mint (Increment 2). Rocco drives a real
 * provider console to create the key; the human only steps in for the password/CAPTCHA wall. The
 * card rides `snapshot.browserSession` off SSE and gives the founder's five moments:
 *   1. a "Show live browser" toggle (watching is OPT-IN — default OFF, no WS/screencast bandwidth),
 *   2. the rendered browser painted on a canvas (mock frames in-sandbox — see note),
 *   3. Rocco AS the cursor, gliding to each action with a press,
 *   4. Rocco-voice SSE action bubbles (visible even with frames off),
 *   5. the cream→orange "your turn" handoff + a satisfying resume.
 *
 * VALUE-FREE: the password step is the USER's — the agent is structurally blind to it (the daemon
 * blanks the screenshot), and the minted value never rides here. The mock frame shows only a MASKED
 * key (`sk-•••`), never a real secret.
 *
 * MOCKED vs LIVE: a real cloud/local frame stream can't run in this sandbox, so the canvas paints a
 * stylized RECORDED frame of the provider page + a scripted Rocco cursor. When a live WS is present
 * (`session.wsUrl`, local Envoyage `--ws-port` / CF-CDP screencast), swap `paintMockFrame` for the
 * decoded WS frame and drive the cursor off `browser_cursor` — the geometry (`mapToPageCss`) is the
 * same either way.
 */

// The mock page's own pixel space (what a real frame's natural size would be). Rocco's cursor coords
// live here; the canvas paints at this resolution and CSS-fits it (page aspect → no letterbox).
const PAGE = { w: 1000, h: 640 };

const DOMAINS: Record<string, string> = { openai: "platform.openai.com" };

type Phase = "driving" | "handoff" | "resumed" | "minted" | "failed";

function phaseOf(s: BrowserSession): Phase {
  if (s.outcome === "minted") return "minted";
  if (s.outcome === "failed") return "failed";
  if (s.state === "HUMAN_NEEDED" || s.state === "PAUSED") return "handoff";
  if (s.state === "RESUMED") return "resumed";
  return "driving";
}

const POSE: Record<Phase, RoccoPose> = {
  driving: "working",
  handoff: "waving",
  resumed: "working",
  minted: "success",
  failed: "error",
};

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

export function BrowserHandoff({
  session,
  onContinue,
  onForwardClick,
}: {
  session?: BrowserSession | null;
  /** Human hit ▶ Continue (real wiring resumes the WS session; symbolic in the mock). */
  onContinue?: () => void;
  /** A forwarded handoff click, in PAGE coords (real wiring posts to the WS; no-op in the mock). */
  onForwardClick?: (page: { x: number; y: number }) => void;
}) {
  const [showLive, setShowLive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reduce = useReducedMotion();

  const phase = session ? phaseOf(session) : "driving";
  const handoff = phase === "handoff";
  const terminal = phase === "minted" || phase === "failed";
  // Handoff FORCES frames on — the human must see the password page. Otherwise it's opt-in.
  const framesOn = (showLive || handoff) && !terminal;

  // Auto-dismiss the terminal card after its sweep (client-only; the daemon leaves it until the
  // next mint replaces it — see finishBrowserSession's ponytail note).
  useEffect(() => {
    if (!terminal) return;
    const t = setTimeout(() => setDismissed(true), 5200);
    return () => clearTimeout(t);
  }, [terminal]);
  // A fresh session (new id) re-arms the card.
  const id = session?.id;
  useEffect(() => {
    setDismissed(false);
  }, [id]);

  if (!session || dismissed) return null;

  const domain = DOMAINS[session.provider] ?? `${session.provider || "provider"} console`;
  const bubbles = session.bubbles ?? [];

  return (
    <div
      style={{
        ...cardStyle,
        borderColor: handoff
          ? "color-mix(in srgb, var(--amber-deep) 55%, var(--line))"
          : phase === "minted"
            ? "color-mix(in srgb, var(--green) 45%, var(--line))"
            : "var(--line)",
        background: handoff
          ? "color-mix(in srgb, var(--amber) 12%, var(--surface))"
          : "var(--surface)",
        transition: reduce ? "none" : "background 400ms var(--ease-effortless), border-color 400ms",
      }}
    >
      <Header
        provider={session.provider}
        phase={phase}
        showLive={showLive}
        forced={handoff}
        onToggle={() => setShowLive((v) => !v)}
      />

      {handoff && <HandoffBanner reason={session.reason} onContinue={onContinue} reduce={reduce} />}

      {framesOn && (
        <LiveCanvas
          domain={domain}
          phase={phase}
          reduce={reduce}
          onForwardClick={handoff ? onForwardClick : undefined}
        />
      )}

      {terminal && <TerminalSweep phase={phase} reduce={reduce} />}

      <Bubbles bubbles={bubbles} />
    </div>
  );
}

// ── header: provider + phase + the opt-in toggle ────────────────────────────────
function Header({
  provider,
  phase,
  showLive,
  forced,
  onToggle,
}: {
  provider: string;
  phase: Phase;
  showLive: boolean;
  forced: boolean;
  onToggle: () => void;
}) {
  const label =
    phase === "minted"
      ? "key minted"
      : phase === "failed"
        ? "mint failed"
        : phase === "handoff"
          ? "your turn"
          : "raiding the console";
  // Green is SACRED — not a Badge tone — so the minted badge gets a direct green override.
  const greenStyle: CSSProperties = {
    color: "var(--green)",
    borderColor: "color-mix(in srgb, var(--green) 40%, var(--line))",
    background: "color-mix(in srgb, var(--green) 10%, transparent)",
  };
  const tone: "amber" | "berry" = phase === "handoff" || phase === "failed" ? "amber" : "berry";
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}
    >
      {phase === "minted" ? (
        <Badge style={greenStyle}>{label}</Badge>
      ) : (
        <Badge tone={tone}>{label}</Badge>
      )}
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: "var(--ink-soft)",
          flex: 1,
          minWidth: 0,
        }}
      >
        browser mint · {provider || "provider"} — the agent never sees your password
      </span>
      <ToggleSwitch on={showLive || forced} disabled={forced} onClick={onToggle} />
    </div>
  );
}

function ToggleSwitch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={on}
      title={disabled ? "on automatically — you need to see the login page" : "watch Rocco work"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid var(--line)",
        borderRadius: radius.pill,
        padding: "5px 10px 5px 8px",
        background: "var(--bg)",
        cursor: disabled ? "default" : "pointer",
        font: "inherit",
        opacity: disabled ? 0.85 : 1,
      }}
    >
      <span
        style={{
          width: 30,
          height: 18,
          borderRadius: 999,
          background: on ? "var(--green)" : "var(--grey)",
          position: "relative",
          transition: "background 200ms",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 14 : 2,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: "#fff",
            transition: "left 200ms var(--ease-snap)",
          }}
        />
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink)" }}>
        show live browser
      </span>
    </button>
  );
}

// ── the terminal sweep: minted (green, Rocco cheers) / failed (Rocco shakes) ────
function TerminalSweep({ phase, reduce }: { phase: Phase; reduce: boolean }) {
  const minted = phase === "minted";
  return (
    <div
      className={reduce ? undefined : ANIM_CLASS}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        marginBottom: 12,
        borderRadius: radius.md,
        border: `1px solid ${minted ? "color-mix(in srgb, var(--green) 45%, var(--line))" : "color-mix(in srgb, var(--danger) 45%, var(--line))"}`,
        background: minted
          ? "color-mix(in srgb, var(--green) 12%, var(--surface))"
          : "color-mix(in srgb, var(--danger) 8%, var(--surface))",
        animation: reduce ? undefined : "ringtail-pop var(--dur-slow) var(--ease-snap) both",
      }}
    >
      <Rocco pose={POSE[phase]} animated={!reduce} framed={false} size={56} />
      <div style={{ fontFamily: font.ui, fontWeight: 700, fontSize: 15 }}>
        {minted
          ? "Key minted — stashed. The agent got names, never the key."
          : "Mint failed — nothing stored."}
      </div>
    </div>
  );
}

// ── the cream→orange "your turn" handoff banner ─────────────────────────────────
function HandoffBanner({
  reason,
  onContinue,
  reduce,
}: {
  reason?: string;
  onContinue?: () => void;
  reduce: boolean;
}) {
  return (
    <div
      className={reduce ? undefined : ANIM_CLASS}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        marginBottom: 12,
        borderRadius: radius.md,
        border: "1px solid color-mix(in srgb, var(--amber-deep) 50%, var(--line))",
        background: "color-mix(in srgb, var(--amber) 20%, var(--surface))",
        animation: reduce ? undefined : "ringtail-rise var(--dur-slow) var(--ease-snap) both",
      }}
    >
      <Rocco pose="waving" animated={!reduce} framed={false} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: font.ui, fontWeight: 700, fontSize: 15 }}>
          You’re driving — Rocco paused &amp; not watching
        </div>
        <div
          style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}
        >
          {reason === "password"
            ? "type your password in the page below (the agent can’t see it), then continue"
            : reason
              ? `clear the ${reason} check below, then continue`
              : "clear the login below, then continue"}
        </div>
      </div>
      <Button size="sm" onClick={onContinue}>
        ▶ Continue
      </Button>
    </div>
  );
}

// ── the live browser canvas + Rocco-as-cursor ───────────────────────────────────
function LiveCanvas({
  domain,
  phase,
  reduce,
  onForwardClick,
}: {
  domain: string;
  phase: Phase;
  reduce: boolean;
  onForwardClick?: (page: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Scripted cursor target in PAGE coords, keyed to phase. During a handoff Rocco LEAVES the canvas
  // (he's "not watching") — he re-appears in the banner instead.
  const target = useMemo(() => {
    if (phase === "resumed") return { x: 500, y: 250 };
    return { x: 470, y: 388 }; // the "Create new secret key" button
  }, [phase]);
  const [cursor, setCursor] = useState(target);
  const [press, setPress] = useState(false);

  useEffect(() => {
    setCursor(target);
    if (reduce) return;
    setPress(true);
    const t = setTimeout(() => setPress(false), 220);
    return () => clearTimeout(t);
  }, [target, reduce]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (ctx) paintMockFrame(ctx, domain, phase);
  }, [domain, phase]);

  const showCursor = phase === "driving" || phase === "resumed";

  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius.md,
        overflow: "hidden",
        marginBottom: 12,
        boxShadow:
          phase === "handoff"
            ? "0 0 0 3px color-mix(in srgb, var(--green) 55%, transparent)"
            : "var(--shadow-soft)",
        transition: reduce ? "none" : "box-shadow 300ms",
      }}
    >
      <canvas
        ref={canvasRef}
        width={PAGE.w}
        height={PAGE.h}
        onPointerDown={
          onForwardClick
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const page = mapToPageCss(
                  { x: e.clientX - r.left, y: e.clientY - r.top },
                  { w: r.width, h: r.height },
                  PAGE,
                );
                if (page) onForwardClick(page);
              }
            : undefined
        }
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: `${PAGE.w} / ${PAGE.h}`,
          cursor: onForwardClick ? "crosshair" : "default",
        }}
      />
      {showCursor && (
        <div
          style={{
            position: "absolute",
            left: `${(cursor.x / PAGE.w) * 100}%`,
            top: `${(cursor.y / PAGE.h) * 100}%`,
            transform: `translate(-14%, -8%) scale(${press ? 0.86 : 1})`,
            transition: reduce
              ? "none"
              : "left 150ms var(--ease-effortless), top 150ms var(--ease-effortless), transform 160ms var(--ease-snap)",
            pointerEvents: "none",
            filter: "drop-shadow(0 4px 8px rgba(33,26,30,.35))",
          }}
        >
          <Rocco pose="working" framed={false} size={46} />
        </div>
      )}
    </div>
  );
}

// ── SSE action bubbles (visible even with frames off) ───────────────────────────
function Bubbles({ bubbles }: { bubbles: { text: string; handoff?: boolean }[] }) {
  if (bubbles.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {bubbles.map((b, i) => (
        <div
          // append-only narration log → index is a stable key
          key={i}
          className={ANIM_CLASS}
          style={{
            alignSelf: "flex-start",
            maxWidth: "85%",
            padding: "6px 12px",
            borderRadius: "12px 12px 12px 4px",
            fontFamily: font.mono,
            fontSize: 12,
            lineHeight: 1.35,
            background: b.handoff
              ? "color-mix(in srgb, var(--amber) 22%, var(--surface))"
              : "color-mix(in srgb, var(--green) 12%, var(--surface))",
            border: `1px solid ${b.handoff ? "color-mix(in srgb, var(--amber-deep) 40%, var(--line))" : "color-mix(in srgb, var(--green) 30%, var(--line))"}`,
            color: "var(--ink)",
            animation: "ringtail-rise var(--dur-base) var(--ease-effortless) both",
          }}
        >
          {b.handoff ? "🖐  " : "🦝  "}
          {b.text}
        </div>
      ))}
    </div>
  );
}

// ── the mock RECORDED frame — a stylized provider page (see MOCKED vs LIVE note) ─
function paintMockFrame(ctx: CanvasRenderingContext2D, domain: string, phase: Phase): void {
  const { w, h } = PAGE;
  ctx.clearRect(0, 0, w, h);
  // page ground
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // browser chrome
  ctx.fillStyle = moonlit.line;
  ctx.fillRect(0, 0, w, 56);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(28 + i * 26, 28, 7, 0, Math.PI * 2);
    ctx.fillStyle = [moonlit.hot, moonlit.amber, moonlit.green][i] ?? moonlit.ink;
    ctx.fill();
  }
  // url pill
  ctx.fillStyle = "#fff";
  roundRect(ctx, 120, 14, w - 160, 28, 14);
  ctx.fill();
  ctx.fillStyle = moonlit.inkSoft;
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText(`🔒  ${domain}`, 140, 34);

  if (phase === "handoff") {
    // a LOGIN wall — the human's moment. Password shown MASKED (never a real value).
    ctx.fillStyle = moonlit.bg;
    ctx.fillRect(0, 56, w, h - 56);
    card(ctx, w / 2 - 210, 150, 420, 300);
    ctx.fillStyle = moonlit.ink;
    ctx.font = "700 30px 'Satoshi', system-ui, sans-serif";
    ctx.fillText("Sign in", w / 2 - 180, 210);
    field(ctx, w / 2 - 180, 240, "you@example.com");
    field(ctx, w / 2 - 180, 300, "••••••••••", true);
    ctx.fillStyle = moonlit.green;
    roundRect(ctx, w / 2 - 180, 372, 360, 44, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 20px 'Satoshi', system-ui, sans-serif";
    ctx.fillText("Continue", w / 2 - 44, 400);
    return;
  }

  // signed-in dashboard
  ctx.fillStyle = moonlit.bg;
  ctx.fillRect(0, 56, w, h - 56);
  ctx.fillStyle = moonlit.ink;
  ctx.font = "700 34px 'Satoshi', system-ui, sans-serif";
  ctx.fillText("API keys", 60, 140);
  // the create button
  ctx.fillStyle = moonlit.green;
  roundRect(ctx, 320, 360, 300, 56, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "600 22px 'Satoshi', system-ui, sans-serif";
  ctx.fillText("+  Create new secret key", 350, 396);

  if (phase === "resumed" || phase === "minted") {
    // the "key created" modal — MASKED value only.
    card(ctx, w / 2 - 240, 200, 480, 200);
    ctx.fillStyle = moonlit.ink;
    ctx.font = "700 24px 'Satoshi', system-ui, sans-serif";
    ctx.fillText("Secret key created", w / 2 - 200, 250);
    ctx.fillStyle = moonlit.surface;
    roundRect(ctx, w / 2 - 200, 280, 400, 44, 8);
    ctx.fill();
    ctx.fillStyle = moonlit.inkSoft;
    ctx.font = "20px 'JetBrains Mono', monospace";
    ctx.fillText("sk-••••••••••••••••••••••••", w / 2 - 180, 308);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = moonlit.line;
  ctx.lineWidth = 2;
  ctx.stroke();
}
function field(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  focus = false,
): void {
  ctx.fillStyle = moonlit.surface;
  roundRect(ctx, x, y, 360, 44, 8);
  ctx.fill();
  ctx.strokeStyle = focus ? moonlit.green : moonlit.line;
  ctx.lineWidth = focus ? 3 : 1.5;
  ctx.stroke();
  ctx.fillStyle = moonlit.inkSoft;
  ctx.font = "18px 'JetBrains Mono', monospace";
  ctx.fillText(text, x + 16, y + 28);
}

const cardStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: radius.md,
  padding: "14px 16px",
  marginBottom: 20,
};
