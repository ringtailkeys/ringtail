import { Badge, Button, Eyebrow, font } from "@ringtail/ui";
import { useEffect, useState } from "react";
import { fetchProjects, type ProjectCandidate } from "../live";

/**
 * Step 2 — choose the local project (architecture.md §"The env axis"). Ringtail is
 * PROJECT-SCOPED: it reads the chosen project's `.env.example` as the manifest and
 * builds the grid from it. The daemon scans sensible roots for dirs carrying a
 * `.env.example`; you pick one, or paste an exact path for anything off the beaten
 * track. Names + paths only — no file contents, nothing secret ever crosses.
 *
 * Progressive disclosure: this is ALL you see until a project is set — no grid, no
 * chat, one decision at a time.
 */
export function ChooseProject({
  agentName,
  onChoose,
  onBack,
  projects: seed,
}: {
  agentName?: string;
  onChoose: (path: string) => void;
  onBack: () => void;
  /** Pre-seeded candidates (Storybook/tests) — skips the live daemon scan when provided. */
  projects?: ProjectCandidate[];
}) {
  const [projects, setProjects] = useState<ProjectCandidate[] | null>(seed ?? null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!seed) void fetchProjects().then(setProjects);
  }, [seed]);

  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: 16,
        maxWidth: 620,
        margin: "0 auto",
      }}
    >
      <Eyebrow>choose your project</Eyebrow>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: "var(--ink-soft)",
          margin: "6px 0 14px",
        }}
      >
        Ringtail is project-scoped — it reads the project's <code>.env.example</code> as the
        manifest and builds the grid from it.
        {agentName ? ` Driving with ${agentName}.` : ""}
      </p>

      {projects === null && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>scanning…</p>
      )}

      {projects && projects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map((p) => (
            <button
              key={p.path}
              type="button"
              onClick={() => onChoose(p.path)}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                textAlign: "left",
                cursor: "pointer",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                background: "var(--surface)",
                color: "var(--ink)",
                padding: "10px 12px",
                fontFamily: font.ui,
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: "var(--ink-soft)" }}>
                {p.path}
              </span>
            </button>
          ))}
        </div>
      )}

      {projects && projects.length === 0 && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--ink-soft)" }}>
          No <code>.env.example</code> projects found on the usual roots — paste a path below.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <Eyebrow>or enter a path</Eyebrow>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) onChoose(manual.trim());
            }}
            placeholder="/Users/you/Development/my-app"
            style={{
              flex: 1,
              fontFamily: font.mono,
              fontSize: 12,
              color: "var(--ink)",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-sm)",
              padding: "8px 10px",
            }}
          />
          <Button
            variant="primary"
            disabled={!manual.trim()}
            onClick={() => onChoose(manual.trim())}
          >
            Use path
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← back
        </Button>
        <Badge tone="berry">🔒 names + paths only</Badge>
      </div>
    </section>
  );
}
