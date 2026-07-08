import type { MintChoices, MintSelection, PendingMint } from "@ringtail/core";
import { Badge, Button, font, radius } from "@ringtail/ui";
import { type CSSProperties, useMemo, useState } from "react";
import { type ChoiceView, defaultSelection, isSelectionComplete, viewChoices } from "./choice";

/**
 * The PendingMints approve card (screen ③). A consequential mint the agent authored —
 * a `{{ROOT}}`-spending write — PARKS under a server nonce and rides the SSE snapshot
 * here. The human reviews the value-free evidence and clicks Approve, which POSTs the
 * nonce back (`approveMint`) — the unforgeable human channel the agent can't forge.
 *
 * GUIDED MINT (PRD §4.5): when the parked mint carries `choices`, the card renders a
 * least-privilege SELECTION UI — pick the resource (domain/zone), the narrowest permission
 * (defaulted), an optional expiry, and WHICH root to spend (only when >1 exists). The
 * {resource, permission, expiry, rootId} selection rides back with the nonce, so the mint
 * is scoped to exactly the human's pick — never a blanket grant.
 *
 * Value-free by construction: NAMES/ids/labels only. `viewChoices` whitelists the safe
 * fields off the SSE payload, so a secret slipped into `choices` can never render here.
 */
export function PendingMints({
  pending,
  onApprove,
}: {
  pending: PendingMint[];
  onApprove?: (nonce: string, selection?: MintSelection) => void;
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
          <MintRow key={p.id} mint={p} onApprove={onApprove} />
        ))}
      </div>
    </div>
  );
}

function MintRow({
  mint: p,
  onApprove,
}: {
  mint: PendingMint;
  onApprove?: (nonce: string, selection?: MintSelection) => void;
}) {
  const verb = p.rotate ? "Rotate" : "Mint";
  const title = p.varName ?? `${verb.toLowerCase()} · ${p.providerAccount}`;
  const header = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: font.ui, fontWeight: 600 }}>{title}</div>
      <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
        {p.providerAccount} · {p.method}
        {p.danger ? ` · ${p.danger}` : ""}
      </div>
    </div>
  );

  // GUIDED path — a selection card scoped to exactly the human's least-privilege pick.
  if (p.choices) {
    return <ChoiceCard mint={p} choices={p.choices} header={header} onApprove={onApprove} />;
  }

  // Plain path — a single Approve of the nonce (no discovery).
  return (
    <div style={rowStyle}>
      {header}
      <Button
        size="sm"
        onClick={onApprove ? () => onApprove(p.nonce) : undefined}
        disabled={!onApprove}
      >
        Approve {verb}
      </Button>
    </div>
  );
}

function ChoiceCard({
  mint: p,
  choices,
  header,
  onApprove,
}: {
  mint: PendingMint;
  choices: MintChoices;
  header: React.ReactNode;
  onApprove?: (nonce: string, selection?: MintSelection) => void;
}) {
  const view: ChoiceView = useMemo(() => viewChoices(choices), [choices]);
  const [sel, setSel] = useState<MintSelection>(() => defaultSelection(view));
  const complete = isSelectionComplete(view, sel);
  const verb = p.rotate ? "Rotate" : "Mint";

  return (
    <div style={{ ...rowStyle, flexDirection: "column", alignItems: "stretch", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {header}
        <Badge tone="berry">least-privilege</Badge>
      </div>

      {/* resource */}
      <Field label="resource">
        <select
          value={sel.resource}
          onChange={(e) => setSel((s) => ({ ...s, resource: e.target.value }))}
          style={selectStyle}
          aria-label="resource"
        >
          {view.resources.length === 0 && <option value="">— none discovered —</option>}
          {view.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>

      {/* permission — narrowest first, [0] pre-selected */}
      <Field label="permission">
        <select
          value={sel.permission}
          onChange={(e) => setSel((s) => ({ ...s, permission: e.target.value }))}
          style={selectStyle}
          aria-label="permission"
        >
          {view.permissions.map((perm, i) => (
            <option key={perm} value={perm}>
              {perm}
              {perm === view.suggestedPermission ? " · suggested (narrowest)" : ""}
              {i === 0 && perm !== view.suggestedPermission ? " · narrowest" : ""}
            </option>
          ))}
        </select>
      </Field>

      {/* expiry — only when the provider supports it */}
      {view.supportsExpiry && (
        <Field label="expiry (optional)">
          <input
            type="date"
            value={sel.expiry ?? ""}
            onChange={(e) => setSel((s) => ({ ...s, expiry: e.target.value || undefined }))}
            style={selectStyle}
            aria-label="expiry"
          />
        </Field>
      )}

      {/* root — only when >1 named root exists */}
      {view.roots && (
        <Field label="root to spend">
          <select
            value={sel.rootId ?? ""}
            onChange={(e) => setSel((s) => ({ ...s, rootId: e.target.value || undefined }))}
            style={selectStyle}
            aria-label="root to spend"
          >
            <option value="">— pick a root —</option>
            {view.roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.provider}
                {r.label ? ` · ${r.label}` : ""}
                {r.account ? ` (${r.account})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="sm"
          disabled={!onApprove || !complete}
          onClick={onApprove ? () => onApprove(p.nonce, sel) : undefined}
        >
          Approve {verb}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: "var(--ink-soft)",
          width: 130,
          flex: "0 0 auto",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  border: "1px solid var(--line)",
  borderRadius: radius.sm,
  padding: "10px 12px",
  background: "var(--bg)",
};

const selectStyle: CSSProperties = {
  flex: 1,
  padding: "6px 8px",
  fontFamily: font.mono,
  fontSize: 12,
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: radius.sm,
};
