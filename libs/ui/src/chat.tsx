import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { font, radius } from "./tokens";

/**
 * ChatPanel — the dashboard is a CONVERSATION (architecture.md §"The dashboard is a
 * conversation, not just a board"). You talk to the same agent that's driving the
 * grid, right here. The chat is the DIRECTION channel (you steer: "also set up
 * Stripe", "skip X"); the grid/wizard/actions are the STATE channel — one agent
 * behind both. Text/intent only: paste bypasses the agent, so nothing here is ever
 * a secret value (the panel never renders one, the agent never authors one).
 *
 * Presentational + token-driven. The message shape is kept structural (not imported
 * from core) so @ringtail/ui stays free of the engine lib — the daemon maps its
 * ChatMessage onto this at the edge.
 */
export interface ChatLine {
  role: "agent" | "user";
  text: string;
  ts?: number;
}

export function ChatPanel({
  messages,
  onSend,
  disabled = false,
  style,
}: {
  messages: ChatLine[];
  /** user → agent (POST /api/chat). Omit / disabled when the daemon is offline. */
  onSend?: (text: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stick to the newest line as the agent streams direction back.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || disabled || !onSend) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md, 12px)",
        boxShadow: "var(--shadow-soft)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
          }}
        >
          talk to the agent
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
          🔒 intent only · never a secret
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 160,
          maxHeight: 320,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 ? (
          <p
            style={{
              fontFamily: font.ui,
              fontSize: 14,
              color: "var(--ink-soft)",
              margin: "auto",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            steer the agent — “also set up Stripe”, “skip the R2 bucket”, “why that scope?”
          </p>
        ) : (
          messages.map((m, i) => <Bubble key={m.ts ?? i} line={m} />)
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)" }}>
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={disabled ? "daemon offline" : "direct the agent…"}
          aria-label="message the agent"
          style={{
            flex: 1,
            fontFamily: font.ui,
            fontSize: 14,
            padding: "9px 12px",
            borderRadius: radius.sm,
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--ink)",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={disabled || draft.trim().length === 0}
          style={{
            fontFamily: font.mono,
            fontSize: 14,
            fontWeight: 500,
            padding: "9px 16px",
            borderRadius: radius.sm,
            border: "none",
            background: "var(--amber)",
            color: "var(--ink)",
            cursor: disabled || draft.trim().length === 0 ? "not-allowed" : "pointer",
            opacity: disabled || draft.trim().length === 0 ? 0.5 : 1,
          }}
        >
          send
        </button>
      </div>
    </div>
  );
}

function Bubble({ line }: { line: ChatLine }) {
  const isAgent = line.role === "agent";
  return (
    <div
      style={{
        alignSelf: isAgent ? "flex-start" : "flex-end",
        maxWidth: "82%",
        padding: "9px 13px",
        borderRadius: radius.md,
        background: isAgent ? "var(--bg)" : "var(--berry)",
        color: isAgent ? "var(--ink)" : "#FCF6EC",
        border: isAgent ? "1px solid var(--line)" : "none",
        fontFamily: font.ui,
        fontSize: 14,
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {line.text}
    </div>
  );
}
