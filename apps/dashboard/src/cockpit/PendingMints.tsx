import type { PendingMint } from "@ringtail/core";
import { Badge, Button, font, radius } from "@ringtail/ui";

/**
 * The PendingMints approve card (screen ③). A consequential mint the agent authored —
 * a `{{ROOT}}`-spending write — PARKS under a server nonce and rides the SSE snapshot
 * here. This is THE bug that kept every real mint at `needs-confirm` forever: nothing
 * rendered `snapshot.pendingMints`. The human reviews the value-free evidence (the
 * env-var being minted · provider · method · audit name) and clicks Approve, which POSTs
 * the nonce back (`approveMint`) — the unforgeable human channel the agent can't forge.
 *
 * Value-free by construction: renders NAMES + method + status only, NEVER a secret value
 * (the nonce is an approval token used in the click handler, not shown). check:no-leak
 * scans the daemon→client payloads this card reads; nothing here surfaces a root/minted key.
 */
export function PendingMints({
  pending,
  onApprove,
}: {
  pending: PendingMint[];
  onApprove?: (nonce: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div
      style={{
        border: "1px solid color-mix(in srgb, var(--amber-deep) 40%, var(--line))",
        borderRadius: radius.md,
        padding: "14px 16px",
        marginBottom: 20,
        background: "color-mix(in srgb, var(--amber) 8%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Badge tone="amber">awaiting approval</Badge>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
          the agent authored a root-spending mint — you approve, it never sees the key
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pending.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              border: "1px solid var(--line)",
              borderRadius: radius.sm,
              padding: "10px 12px",
              background: "var(--bg)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font.ui, fontWeight: 600 }}>
                {p.varName ?? `mint · ${p.providerAccount}`}
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                {p.providerAccount} · {p.method}
                {p.danger ? ` · ${p.danger}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              onClick={onApprove ? () => onApprove(p.nonce) : undefined}
              disabled={!onApprove}
            >
              Approve
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
