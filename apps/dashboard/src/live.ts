import type { CredentialStatus } from "@ringtail/ui";
import type { DaemonSnapshot, GridEnv, GridRow } from "@ringtail/core";
import { MIXED } from "./cockpit/fixtures";

/**
 * The live wire to the daemon: fetch the session token, open the token-gated SSE
 * stream, and hand each pushed DaemonSnapshot to the cockpit. ONE network target —
 * the local daemon. Nothing phones home (zero telemetry). If the daemon is down we
 * fall back to fixtures so the cockpit (and Storybook) still renders.
 */

// When the daemon serves the built dashboard (`ringtail up`), it's same-origin, so
// default to "" → relative fetches (`/api/session`, `/events`, `/api/*`) hit the
// daemon that served this page. Standalone Vite dev (Tilt) injects VITE_DAEMON_URL
// to point cross-origin at the daemon's own port.
const DAEMON_URL = import.meta.env.VITE_DAEMON_URL ?? "";

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

/** The user → agent direction channel: POST the chat text to the daemon, which
 * appends it to the transcript (renders at once over SSE) and queues it for the
 * agent to drain (pollChat). Intent text only — never a secret value. */
export async function sendChat(text: string): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`sendChat failed: ${res.status}`);
}

/** The BROWSER approve path for a mapped action: POST id (+ confirmed for a
 * destructive one that cleared the two-step gate) → daemon runs it with the stored
 * creds. Returns the value-free run result; throws on transport failure. */
export async function approveAction(id: string, confirmed?: boolean): Promise<unknown> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, confirmed }),
  });
  if (!res.ok) throw new Error(`approveAction failed: ${res.status}`);
  return res.json();
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

/** Step 1: commit the connected agent to daemon state (id → advances to step 2).
 * Pass null to disconnect (falls the gate back to step 1). */
export async function setAgent(id: string | null): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`setAgent failed: ${res.status}`);
}

export interface ProjectCandidate {
  path: string;
  name: string;
  hasEnvExample: boolean;
}

/** Step 2: local dirs with a `.env.example` (names/paths only; empty if daemon down). */
export async function fetchProjects(): Promise<ProjectCandidate[]> {
  try {
    const token = await ensureToken();
    const res = await fetch(`${DAEMON_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return ((await res.json()) as { projects: ProjectCandidate[] }).projects;
  } catch {
    return [];
  }
}

/** Step 2: set the active project by path (daemon rebuilds the grid from its
 * `.env.example` → advances to the cockpit). Pass null to clear (back to step 2). */
export async function setProject(path: string | null): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/project`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`setProject failed: ${res.status}`);
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
  return { grid, wizard: null, actions: [], chat: [], agent: null, project: null };
}
