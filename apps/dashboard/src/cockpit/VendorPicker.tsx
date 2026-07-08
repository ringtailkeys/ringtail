import { font, radius } from "@ringtail/ui";
import { type CSSProperties, useMemo, useState } from "react";
import { type Vendor, VENDORS, filterVendors, groupVendors } from "./vendors";

/**
 * The vendor picker (PRD §4.8) — an autocomplete over the CANONICAL provider set. The
 * user types, we filter over id · label · tags and group the hits by category; picking a
 * row emits the canonical lowercase id (never free text) — the root-cause fix for the
 * "Resend" vs "resend" casing footgun. Each vendor shows its bundled mark (favicon-style
 * SVG under /vendors); an unknown/absent mark falls back to a monogram (NO network fetch —
 * this app has ONE network target, the daemon; a remote favicon would break zero-telemetry).
 */

/** A vendor's bundled mark, with a monogram fallback (offline, no network). */
export function VendorLogo({ id, size = 22 }: { id: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: radius.sm,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          fontFamily: font.ui,
          fontWeight: 700,
          fontSize: size * 0.5,
          color: "var(--ink-soft)",
          flex: "0 0 auto",
        }}
      >
        {id.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={`/vendors/${id}.svg`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ borderRadius: radius.sm, flex: "0 0 auto", display: "block" }}
    />
  );
}

export function VendorPicker({
  value,
  onPick,
}: {
  /** The currently-picked canonical id (or null). */
  value: string | null;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupVendors(filterVendors(VENDORS, query)), [query]);
  const picked = value ? (VENDORS.find((v) => v.id === value) ?? null) : null;

  return (
    <div style={{ position: "relative" }}>
      <input
        placeholder="search a provider (e.g. resend, cloudflare, neon)…"
        value={open ? query : picked ? picked.label : query}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={inputStyle}
        aria-label="search a provider"
      />
      {open && (
        <div style={dropdownStyle}>
          {groups.length === 0 && (
            <div
              style={{
                padding: "10px 12px",
                fontFamily: font.mono,
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              no provider matches “{query}”
            </div>
          )}
          {groups.map((g) => (
            <div key={g.category}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-soft)",
                  padding: "8px 12px 4px",
                }}
              >
                {g.category}
              </div>
              {g.vendors.map((v) => (
                <VendorRow key={v.id} vendor={v} onPick={() => onPick(v.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VendorRow({ vendor, onPick }: { vendor: Vendor; onPick: () => void }) {
  return (
    <button
      type="button"
      // onMouseDown (not onClick) so it fires before the input's onBlur closes the list.
      onMouseDown={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
        color: "var(--ink)",
      }}
    >
      <VendorLogo id={vendor.id} />
      <span style={{ fontFamily: font.ui, fontWeight: 600, fontSize: 13 }}>{vendor.label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 10, color: "var(--ink-soft)" }}>
        {vendor.id}
      </span>
      {vendor.oauth && (
        <span
          style={{
            marginLeft: "auto",
            fontFamily: font.mono,
            fontSize: 10,
            color: "var(--green)",
            border: "1px solid color-mix(in srgb, var(--green) 40%, var(--line))",
            borderRadius: radius.pill,
            padding: "1px 7px",
          }}
        >
          OAuth
        </span>
      )}
    </button>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontFamily: font.mono,
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: radius.sm,
};

const dropdownStyle: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 320,
  overflowY: "auto",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: radius.md,
  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
};
