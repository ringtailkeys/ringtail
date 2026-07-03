import { getEnv } from "@ringtail/config";
import { connectionMap, provisionCredential, defaultEnvironment } from "@ringtail/core";
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
 * localhost:<daemon>/oauth/callback?recipe=…&state=…; we hand off to core's real
 * lifecycle (consent → mint → validate → provision → sync) for that recipe. In
 * dev this drives the mock provider (MOCK_PROVIDER_URL); in prod, a live recipe.
 * The response carries the status + key NAMES only — NEVER a secret value.
 */
app.get("/oauth/callback", async (c) => {
  const recipe = c.req.query("recipe") ?? "mock";
  const state = c.req.query("state") ?? null;
  try {
    const report = await provisionCredential(recipe, { env: defaultEnvironment() });
    // Strip to a value-free shape (report already carries names only).
    return c.json({
      ok: report.status === "synced",
      state,
      recipe: report.recipe,
      status: report.status,
      scopes: report.scopes,
      missing: report.missing,
      keys: report.keys,
    });
  } catch (err) {
    return c.json(
      { ok: false, state, recipe, error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

// $PORT wins (portless/Tilt inject it); fall back to validated config default.
const port = Number(process.env.PORT) || getEnv().DAEMON_PORT;

export default { port, fetch: app.fetch };
