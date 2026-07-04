import { randomBytes } from "node:crypto";
import { getEnv } from "@ringtail/config";
import { connectionMap, defaultEnvironment, provisionCredential } from "@ringtail/core";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { buildMcpServer } from "./mcp";
import { DaemonStore } from "./state";

/**
 * @ringtail/daemon — the LOCAL machine surface AND the MCP server, in ONE process
 * so the dashboard and the agent share ONE live state (architecture.md §"The
 * daemon"). It:
 *   - serves the legacy status routes (/health, /api/status, /oauth/callback),
 *   - is the MCP server over Streamable HTTP at /mcp (Web-Standard transport, the
 *     Hono-native fit), bound to 127.0.0.1, gated by a session token,
 *   - streams live state to the dashboard over SSE at /events (token-gated).
 *
 * `createDaemon()` is pure (no listen) so the driver + the leak-guard boot it
 * in-process; the `import.meta.main` block is the real `ringtail up` entry.
 * type:service → depends only DOWN on libs, never on an app. ZERO TELEMETRY.
 */

export interface DaemonOpts {
  /** Project name for provisioning (db/project naming). */
  repoName?: string;
  /** Where the local sink writes (.env.local). Defaults to cwd/.env.local. */
  envLocalPath?: string;
  /** Override the minted session token (tests/driver). */
  token?: string;
}

export interface Daemon {
  app: Hono;
  token: string;
  store: DaemonStore;
}

export function createDaemon(opts: DaemonOpts = {}): Daemon {
  // Session token: required on every /mcp call + the /events stream. Random per boot.
  const token = opts.token ?? randomBytes(24).toString("hex");
  const store = new DaemonStore();
  const app = new Hono();

  // CORS for the local dashboard (loopback dev, standalone Vite on another port).
  // ponytail: `*` is safe here — the daemon binds 127.0.0.1 only and the token
  // still gates /mcp + /events. Real `up` serves the dashboard same-origin.
  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, mcp-session-id, mcp-protocol-version",
    );
    c.header("Access-Control-Expose-Headers", "mcp-session-id");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  const bearer = (c: { req: { header: (n: string) => string | undefined } }): string =>
    (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");

  // ── legacy machine surface (unchanged) ─────────────────────────────────────
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/status", (c) => c.json({ providers: connectionMap() }));
  app.get("/oauth/callback", async (c) => {
    const recipe = c.req.query("recipe") ?? "mock";
    const state = c.req.query("state") ?? null;
    try {
      const report = await provisionCredential(recipe, { env: defaultEnvironment() });
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

  // Hand the local dashboard its token so it can open the gated SSE stream.
  // ponytail: loopback-only convenience for P2; real `up` embeds the token in the
  // served HTML instead of exposing this endpoint.
  app.get("/api/session", (c) => c.json({ token }));

  // ── MCP over Streamable HTTP (Web-Standard transport) ──────────────────────
  // Stateless JSON mode: our live state lives in the shared DaemonStore, not an MCP
  // session — so we mint a fresh server+transport per request (the transport is
  // single-use in stateless mode) while every tool mutates the ONE shared store.
  const mcpOpts = { repoName: opts.repoName ?? "ringtail", envLocalPath: opts.envLocalPath };
  app.all("/mcp", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const server = buildMcpServer(store, mcpOpts);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  // ── SSE: live state → dashboard (token-gated) ──────────────────────────────
  app.get("/events", (c) => {
    if (c.req.query("token") !== token) return c.json({ error: "unauthorized" }, 401);
    const enc = new TextEncoder();
    let unsubscribe: () => void = () => undefined;
    const body = new ReadableStream({
      start(controller) {
        unsubscribe = store.subscribe((snap) => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(snap)}\n\n`));
        });
      },
      cancel() {
        unsubscribe();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });

  return { app, token, store };
}

// ── real entry: `ringtail up` boots the daemon on 127.0.0.1 and prints the token ─
if (import.meta.main) {
  const port = Number(process.env.PORT) || getEnv().DAEMON_PORT;
  const { app, token } = createDaemon({ envLocalPath: process.env.RINGTAIL_ENV_LOCAL });
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: app.fetch });
  const dashPort = getEnv().DASHBOARD_PORT;
  // The boot line — MCP URL + session token + dashboard. Bind is 127.0.0.1 only.
  console.log(
    [
      "",
      "  ringtail daemon — your keys, raided · washed · stashed",
      `  MCP:       http://127.0.0.1:${server.port}/mcp   (Authorization: Bearer <token>)`,
      `  events:    http://127.0.0.1:${server.port}/events?token=<token>`,
      `  dashboard: http://127.0.0.1:${dashPort}   (VITE_DAEMON_URL=http://127.0.0.1:${server.port})`,
      `  token:     ${token}`,
      "  bind:      127.0.0.1 only · zero telemetry",
      "",
    ].join("\n"),
  );
}
