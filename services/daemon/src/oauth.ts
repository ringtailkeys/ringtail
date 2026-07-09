import {
  buildAuthorizeUrl,
  clientId,
  exchangeCode,
  generatePkce,
  generateState,
  getOAuthProvider,
  listConnectors,
} from "@ringtail/core";
import { listConnectedProviders, putGrant } from "@ringtail/store";

/**
 * The daemon side of the OAuth "Connect a provider" flow (PRD §4.9). Loopback redirect
 * + PKCE, the way CLI/desktop tools do it. Three moves, all value-free until the token
 * lands in the vault:
 *   1. POST /api/connect/start {provider} → { authorizeUrl }  (PKCE + state generated)
 *   2. GET  /oauth/callback?code&state    → exchange, vault the grant, "close this tab"
 *   3. GET  /api/connect/status           → connected providers (names+scopes+expiry only)
 *
 * The pending-flow map holds the PKCE verifier + state between (1) and (2) — IN MEMORY,
 * never on disk (it's short-lived CSRF/PKCE material). A daemon restart drops in-flight
 * connects, which is the correct fail-safe (the user just clicks connect again).
 * ponytail: module-level Map — one daemon, one process. No eviction; a stale unfinished
 * flow is harmless (it can only be completed by its own unguessable state). Add a TTL
 * sweep if a long-lived daemon accumulates abandoned flows in practice.
 */
interface PendingFlow {
  provider: string;
  verifier: string;
  redirectUri: string;
}
const pendingFlows = new Map<string, PendingFlow>();

export interface StartResult {
  authorizeUrl?: string;
  error?: string;
}

/**
 * Begin a connect: resolve the provider, generate PKCE + state, build the authorize URL
 * against a LOOPBACK redirect (`${origin}/oauth/callback`), and park the verifier+state.
 * Value-free: no token exists yet. `origin` is THIS daemon's request origin (127.0.0.1:port).
 */
export function startConnect(provider: string, origin: string): StartResult {
  const p = getOAuthProvider(provider);
  if (!p) return { error: `unknown provider: ${provider}` };
  if (!clientId(p)) return { error: `${p.id} needs client credentials (set ${p.clientIdEnv})` };
  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const redirectUri = `${origin}/oauth/callback`;
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(p, { redirectUri, state, challenge });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  pendingFlows.set(state, { provider: p.id, verifier, redirectUri });
  return { authorizeUrl };
}

export interface CallbackResult {
  provider: string;
}

/**
 * Complete a connect from the loopback callback. Returns null when `state` matches NO
 * pending OAuth flow — the caller then falls through to the legacy /oauth/callback
 * behavior (so this route can carry both without a breaking change). On a match: verify
 * state (one-time — deleted here), exchange code+verifier at the token endpoint, and
 * store the grant in the vault VALUE-FREE. Throws on exchange failure (caller renders it).
 */
export async function handleCallback(
  code: string | undefined,
  state: string | undefined,
): Promise<CallbackResult | null> {
  if (!state) return null;
  const flow = pendingFlows.get(state);
  if (!flow) return null; // unknown state → not ours (or replay/CSRF) → let the caller fall back
  pendingFlows.delete(state); // one-time: a state can never be replayed
  if (!code) throw new Error("callback missing authorization code");
  const p = getOAuthProvider(flow.provider);
  if (!p) throw new Error(`unknown provider: ${flow.provider}`);
  const grant = await exchangeCode(p, {
    code,
    verifier: flow.verifier,
    redirectUri: flow.redirectUri,
  });
  putGrant(flow.provider, grant); // tokens → vault (0600), NEVER returned
  return { provider: flow.provider };
}

/** The token-gated status surface: connected providers (value-free) + the connector
 * catalogue (signup / api-keys URLs + needs-creds flags) for agent-guided onboarding. */
export function connectStatus(): {
  connected: ReturnType<typeof listConnectedProviders>;
  connectors: ReturnType<typeof listConnectors>;
} {
  return { connected: listConnectedProviders(), connectors: listConnectors() };
}

/** A minimal "connected — you can close this tab" page for the callback. */
export function connectedHtml(provider: string): string {
  const safe = provider.replace(/[^a-z0-9_-]/gi, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connected</title>
<style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f0f0f;color:#eee}
.card{text-align:center}.ok{font-size:48px}</style></head>
<body><div class="card"><div class="ok">✅</div><h1>Connected — ${safe}</h1>
<p>You can close this tab and return to Ringtail.</p></div></body></html>`;
}
