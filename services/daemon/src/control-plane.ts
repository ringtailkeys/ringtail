import { getEnv } from "@ringtail/config";

/**
 * The ONE outbound wire to the hosted control-plane (account + billing). The OSS tool
 * ships NO auth/billing of its own — it CALLS a configurable control-plane
 * (`RINGTAIL_CONTROL_PLANE_URL`) for Better Auth sign-in, entitlement, freemium usage,
 * and the Dodo checkout session.
 *
 * THE BOUNDARY: everything here carries only an email, a one-time code, the account
 * SESSION token, or a usage COUNT — NEVER a provider key or root secret. The vault
 * (@ringtail/store credentials/roots) is never read in this file. That's what keeps
 * `check:no-leak` green: no secret VALUE can reach the control-plane through this path.
 */

const base = (): string => getEnv().RINGTAIL_CONTROL_PLANE_URL.replace(/\/$/, "");

export interface Entitlement {
  tier: "free" | "pro";
  email: string;
  expiresAt?: string;
  usage: { projectsProvisioned: number; freeLimit: number };
}

async function cpFetch(path: string, init: RequestInit, session?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session) headers.Authorization = `Bearer ${session}`;
  return fetch(`${base()}${path}`, { ...init, headers });
}

/** Better Auth email-OTP: send a one-time code to the email (email only, no secret). */
export async function sendOtp(email: string): Promise<void> {
  const res = await cpFetch("/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
}

/** Better Auth email-OTP verify → the account SESSION token (bearer). Returns the token
 * so the daemon can persist it privately; the token never leaves the daemon again except
 * as a Bearer to this same control-plane. */
export async function verifyOtp(email: string, otp: string): Promise<string> {
  const res = await cpFetch("/api/auth/sign-in/email-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) throw new Error(`verification failed: ${res.status}`);
  // Better Auth bearer plugin returns the token in `set-auth-token`; some setups put it
  // in the body. Prefer the header, fall back to the body.
  const header = res.headers.get("set-auth-token");
  if (header) return header;
  const body = (await res.json().catch(() => ({}))) as { token?: string };
  if (!body.token) throw new Error("no session token in verify response");
  return body.token;
}

/** GET /api/entitlement → the account's tier + server-side usage. Session-gated. */
export async function getEntitlement(session: string): Promise<Entitlement> {
  const res = await cpFetch("/api/entitlement", { method: "GET" }, session);
  if (!res.ok) throw new Error(`entitlement failed: ${res.status}`);
  return (await res.json()) as Entitlement;
}

/** POST /api/usage → increment the account's provision count (server-side, so a reinstall
 * can't reset it). Returns whether this provision is allowed under the free limit. */
export async function recordUsage(
  session: string,
): Promise<{ allowed: boolean; projectsProvisioned: number; freeLimit: number }> {
  const res = await cpFetch("/api/usage", { method: "POST", body: "{}" }, session);
  if (!res.ok) throw new Error(`usage failed: ${res.status}`);
  return (await res.json()) as {
    allowed: boolean;
    projectsProvisioned: number;
    freeLimit: number;
  };
}

/** POST /api/checkout → a Dodo overlay checkout session URL (opened in-app, no new tab). */
export async function createCheckout(session: string): Promise<{ url: string }> {
  const res = await cpFetch("/api/checkout", { method: "POST", body: "{}" }, session);
  if (!res.ok) throw new Error(`checkout failed: ${res.status}`);
  return (await res.json()) as { url: string };
}

/** POST /api/portal → a Dodo billing-portal session URL (manage/cancel an active sub).
 * Session-gated, URL only — no secret crosses this path (check:no-leak stays green). */
export async function createPortalSession(session: string): Promise<{ url: string }> {
  const res = await cpFetch("/api/portal", { method: "POST", body: "{}" }, session);
  if (!res.ok) throw new Error(`portal failed: ${res.status}`);
  return (await res.json()) as { url: string };
}
