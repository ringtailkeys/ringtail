import { getEnv } from "@ringtail/config";
import { connectionMap } from "@ringtail/core";
import { Hono } from "hono";

/**
 * @ringtail/daemon — the LOCAL machine surface. The dashboard (a human app)
 * and the CLI both talk to it over localhost; it wires the libs and owns the
 * one route provider OAuth redirects can reach (/oauth/callback). type:service
 * → depends only DOWN on libs (core/config/store), never on an app.
 */
const app = new Hono();

/** Liveness — the dashboard polls this to know the daemon is up. */
app.get("/health", (c) => c.json({ ok: true }));

/**
 * The connection grid the dashboard renders: providers × {dev,staging,prod}
 * with connected / missing / needs-consent. Real-shaped data straight from
 * @ringtail/core (RECIPES + the root store) — no hardcoded fixture.
 */
app.get("/api/status", (c) => c.json({ providers: connectionMap() }));

/**
 * OAuth redirect catcher. Providers bounce the consent grant back to
 * localhost:<daemon>/oauth/callback?code=…&state=…; the real handler will
 * exchange the code and hand off to core's acquire step. Stub for now.
 */
app.get("/oauth/callback", (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  // ponytail: echo-only stub. Wire code→token exchange + core.acquire() here.
  return c.json({ ok: true, received: { code: code ?? null, state: state ?? null } });
});

// $PORT wins (portless/Tilt inject it); fall back to validated config default.
const port = Number(process.env.PORT) || getEnv().DAEMON_PORT;

export default { port, fetch: app.fetch };
