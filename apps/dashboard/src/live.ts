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
