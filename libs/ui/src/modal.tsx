import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { font } from "./tokens";

/**
 * The consent-moment modal — a warm surface card over a dimmed nocturne. Built on
 * the native <dialog> element via showModal(), so Escape-to-close, focus-trap, and
 * the ::backdrop come for free (accessible + no static-element click hacks). Close
 * with Escape or the footer buttons. Not a compliance wizard — one clear "allow".
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        width: "min(440px, 100%)",
        background: "var(--surface)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md, 12px)",
        boxShadow: "var(--shadow-float)",
        padding: 24,
        animation: "ringtail-rise var(--dur-base,250ms) var(--ease-snap)",
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
            marginBottom: 8,
          }}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <h2
          style={{
            fontFamily: font.display,
            fontSize: "1.5rem",
            margin: "0 0 12px",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
      )}
      <div style={{ fontFamily: font.ui, fontSize: 15, lineHeight: 1.6 }}>{children}</div>
      {footer && (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          {footer}
        </div>
      )}
    </dialog>
  );
}

/** Keyframes + the warm ::backdrop the Modal relies on — mount once (preview/App). */
export const modalKeyframes = `
@keyframes ringtail-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
dialog::backdrop { background: color-mix(in srgb, #211A1E 55%, transparent); backdrop-filter: blur(2px); }
`;
