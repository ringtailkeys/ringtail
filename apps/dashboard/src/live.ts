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

/** The DASHBOARD root-key intake: POST a per-account MASTER key user → daemon
 * (never through the agent), stored in the global ~/.ringtail vault. Same trust
 * path as a paste. Returns the value-free result ({ providerAccount, roots }) — the
 * NAMES of accounts we now hold a root for, never a value; throws on transport failure. */
export async function submitRoot(
  providerAccount: string,
  value: string,
): Promise<{ providerAccount: string; roots: string[] }> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/root`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ providerAccount, value }),
  });
  if (!res.ok) throw new Error(`submitRoot failed: ${res.status}`);
  return (await res.json()) as { providerAccount: string; roots: string[] };
}

/** The user → agent direction channel: POST the chat text to the daemon, which
 * appends it to the transcript (renders at once over SSE) and queues it for the
 * agent (delivered as pendingUserMessages on its next tool call). Intent text only —
 * never a secret value. */
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

/** The UNFORGEABLE human approve for a PARKED consequential mint (the PendingMints
 * card). A `{{ROOT}}`-spending write parks under a server nonce that rides the SSE
 * snapshot to the dashboard ONLY; posting it back to /api/action runs the real mint
 * with the stored root key. The agent never received this nonce, so it can't self-
 * approve the write it authored. Body is `{ nonce }` (NOT `{ id, confirmed }` — that's
 * the mapped-action path). Returns the value-free run result; throws on transport failure. */
export async function approveMint(nonce: string): Promise<unknown> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nonce }),
  });
  if (!res.ok) throw new Error(`approveMint failed: ${res.status}`);
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

// ── the sign-in GATE + freemium (proxied through the daemon to the control-plane) ──
// Only an email / one-time code / nothing crosses to the daemon here — never a secret.
// The daemon holds the account session; the dashboard just drives the gate off SSE.

/** Sign-in phase 1: ask the control-plane (via daemon) to email a one-time code. */
export async function signIn(email: string): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => ({}))) as { error?: string }).error ??
        `sign-in failed: ${res.status}`,
    );
}

/** Sign-in phase 2: verify the code → the daemon persists the session + pushes auth over SSE. */
export async function verifyOtp(email: string, otp: string): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => ({}))) as { error?: string }).error ??
        `verify failed: ${res.status}`,
    );
}

/** Sign out — drop the local session (the account's server-side usage is untouched). */
export async function signOut(): Promise<void> {
  const token = await ensureToken();
  await fetch(`${DAEMON_URL}/api/signout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Open a Dodo overlay checkout session (URL only; the overlay renders in-app). */
export async function checkout(): Promise<{ url: string }> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`checkout failed: ${res.status}`);
  return (await res.json()) as { url: string };
}

/** Open the Dodo billing portal (manage/cancel the sub). Returns the URL; the daemon
 * proxies /api/portal → control-plane. The account view opens it in a new tab. */
export async function openBillingPortal(): Promise<void> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`portal failed: ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  window.open(url, "_blank", "noopener");
}

/** Re-check entitlement (polled while the Dodo overlay is open, and after upgrade to
 * unlock). Returns the fresh tier; the daemon also pushes the new auth over SSE. */
export async function refreshEntitlement(): Promise<"free" | "pro"> {
  const token = await ensureToken();
  const res = await fetch(`${DAEMON_URL}/api/entitlement/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "free";
  return ((await res.json()) as { tier: "free" | "pro" }).tier;
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
  return {
    grid,
    wizard: null,
    actions: [],
    chat: [],
    agent: null,
    project: null,
    pendingMints: [],
    // Offline/Storybook: signed-in so the fixture cockpit renders (the gate needs a
    // live daemon to enforce sign-in; the daemon-down path is the demo/fixture view).
    auth: { signedIn: true, tier: "pro" },
    // Fixtures are the offline demo view; `!live` short-circuits the gate to the cockpit
    // regardless, so this is cosmetic — mark it `app` to represent the full product.
    edition: "app",
  };
}
