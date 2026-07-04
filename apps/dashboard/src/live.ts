import type { CredentialStatus } from "@ringtail/ui";
import type { DaemonSnapshot, GridEnv, GridRow } from "@ringtail/core";
import { MIXED } from "./cockpit/fixtures";

/**
 * The live wire to the daemon: fetch the session token, open the token-gated SSE
 * stream, and hand each pushed DaemonSnapshot to the cockpit. ONE network target —
 * the local daemon. Nothing phones home (zero telemetry). If the daemon is down we
 * fall back to fixtures so the cockpit (and Storybook) still renders.
 */

// Standalone Vite dev points at the daemon's port; when the daemon serves the
// dashboard it's same-origin ("").
const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:4880";

export const GRID_ENVS: GridEnv[] = ["local", "dev", "staging", "prod"];

// Cached session token — set when subscribeLive fetches it, reused by the POST
// paths (submitStep, fetchAgents) so we don't re-fetch per call. Loopback only.
let sessionToken: string | null = null;

async function ensureToken(): Promise<string> {
  if (sessionToken) return sessionToken;
  const r = await fetch(`${DAEMON_URL}/api/session`);
  sessionToken = ((await r.json()) as { token: string }).token;
  return sessionToken;
}

/** The BROWSER paste path: POST the value user → daemon (never through the agent).
 * Returns the value-free result ({ stepId, varName?, status }); throws on failure. */
export async function submitStep(stepId: string, value?: string): Promise<{ status: string }> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stepId, value }),
  });
  if (!res.ok) throw new Error(`submitStep failed: ${res.status}`);
  return (await res.json()) as { status: string };
}

export interface DetectedAgent {
  id: string;
  name: string;
  present: boolean;
  connect: string;
}

/** Detected agent CLIs on PATH + their connect commands (empty if daemon is down). */
export async function fetchAgents(): Promise<DetectedAgent[]> {
  try {
    const token = await ensureToken();
    const res = await fetch(`${DAEMON_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return ((await res.json()) as { agents: DetectedAgent[] }).agents;
  } catch {
    return [];
  }
}

/** Subscribe to live daemon state. Returns an unsubscribe fn. Calls onDown once if
 * the daemon can't be reached (session fetch or SSE fails) → render fixtures. */
export function subscribeLive(
  onSnapshot: (snap: DaemonSnapshot) => void,
  onDown: () => void,
): () => void {
  let cancelled = false;
  let es: EventSource | null = null;

  fetch(`${DAEMON_URL}/api/session`)
    .then((r) => r.json() as Promise<{ token: string }>)
    .then(({ token }) => {
      if (cancelled) return;
      sessionToken = token;
      es = new EventSource(`${DAEMON_URL}/events?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        try {
          onSnapshot(JSON.parse(e.data) as DaemonSnapshot);
        } catch {
          // malformed frame — skip; the next snapshot supersedes it.
        }
      };
      es.onerror = () => onDown();
    })
    .catch(() => onDown());

  return () => {
    cancelled = true;
    es?.close();
  };
}

/** Fixtures fallback as a 4-column snapshot (local mirrors dev) — daemon-down + Storybook. */
export function fixtureSnapshot(): DaemonSnapshot {
  const grid: GridRow[] = MIXED.map((p) => ({
    provider: p.id,
    envVars: p.envVars,
    envs: {
      local: p.envs.dev as CredentialStatus,
      dev: p.envs.dev,
      staging: p.envs.staging,
      prod: p.envs.prod,
    },
  }));
  return { grid, wizard: null, actions: [] };
}
