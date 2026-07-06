import type { GridRow } from "@ringtail/core";
import { ANIM_CLASS, StatusChip, font, revealStyle } from "@ringtail/ui";
import { GRID_ENVS } from "../live";

/**
 * The live connection grid: providers × {local, dev, staging, prod} — the P1 local
 * column plus the three deployed envs. Each cell is a CredentialStatus rendered by
 * @ringtail/ui's StatusChip (green stays SACRED). Driven by the daemon's live state
 * over SSE; the `local` header carries the sink rule (local → .env.local).
 */
export function LiveGrid({ grid }: { grid: GridRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <tr>
            <Th align="left">provider</Th>
            {GRID_ENVS.map((e) => (
              <Th key={e} align="center">
                {e}
                {e === "local" ? " · .env.local" : ""}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, i) => (
            <tr
              key={row.provider}
              className={ANIM_CLASS}
              style={{ borderTop: "1px solid var(--line)", ...revealStyle(i * 60 + 60) }}
            >
              <td style={{ padding: "14px 12px" }}>
                <div style={{ fontFamily: font.ui, fontWeight: 600, color: "var(--ink)" }}>
                  {row.provider}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                  {row.envVars.join(" · ")}
                </div>
              </td>
              {GRID_ENVS.map((e) => (
                <td key={e} style={{ padding: "14px 12px", textAlign: "center" }}>
                  <StatusChip status={row.envs[e]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: "left" | "center" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "0 12px 10px",
        fontFamily: font.mono,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--ink-soft)",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
