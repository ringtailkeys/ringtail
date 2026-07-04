import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { getEnv } from "@ringtail/config";
import {
  connectionMap,
  defaultEnvironment,
  gridFromExample,
  gridSeed,
  provisionCredential,
  reuseKnownCredentials,
} from "@ringtail/core";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { runAction } from "./action";
import { detectAgents } from "./agents";
import { buildMcpServer } from "./mcp";
import { scanProjects } from "./projects";
import { DaemonStore } from "./state";
import { applyStep } from "./submit";

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
  /** Run local credential discovery at boot (architecture.md §"Local credential
   * discovery"): scan known stores, reuse a complete root grant, seed the grid as
   * already-connected. Off by default so the in-process tests stay deterministic;
   * `ringtail up` turns it on. */
  discover?: boolean;
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

  // Local credential discovery (transparent): reuse a root grant we already hold so
  // the grid shows already-connected instead of missing. Names + provenance logged;
  // no value is ever printed or leaves the daemon.
  if (opts.discover) {
    for (const r of reuseKnownCredentials({ envLocalPath: opts.envLocalPath })) {
      store.markDiscovered([r.provider]);
      console.log(
        `[discover] ${r.provider}: reused ${r.reused.map((x) => `${x.key} (${x.source})`).join(", ")}`,
      );
    }
  }

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

  // POST /api/step — the BROWSER paste path (architecture.md §"Step kinds · paste").
  // The value flows user → daemon → validate → @ringtail/store, NEVER through the
  // agent. Shares applyStep with the MCP submitStep tool; the response is status +
  // var NAME only (no value → check:no-leak stays green). Token-gated like /mcp.
  app.post("/api/step", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { stepId?: string; value?: string };
    if (!body.stepId) return c.json({ error: "stepId required" }, 400);
    try {
      return c.json(applyStep(store, body.stepId, body.value));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/chat — the USER → agent direction channel. The user types in the
  // dashboard; the message is appended to the transcript (renders at once over SSE)
  // AND queued for the agent to drain via the pollChat MCP tool. Intent TEXT only —
  // never a secret value (paste has its own path, POST /api/step). Token-gated.
  app.post("/api/chat", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) return c.json({ error: "text required" }, 400);
    store.postUserMessage(text);
    return c.json({ ok: true });
  });

  // POST /api/action — the BROWSER approve path for a mapped action (the "Next steps"
  // panel). Shares runAction with the MCP executeAction tool, so the SAME gates apply:
  // prerequisites, and the hard-confirm for `destructive` (the panel sends
  // confirmed:true only after the user clears the two-step destructive gate). The
  // daemon executes with the stored creds and returns status/names, never values.
  app.post("/api/action", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { id?: string; confirmed?: boolean };
    if (!body.id) return c.json({ error: "id required" }, 400);
    try {
      const result = await runAction(store, body.id, {
        repoName: opts.repoName ?? "ringtail",
        envLocalPath: opts.envLocalPath,
        confirmed: body.confirmed,
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // GET /api/agents — detected coding-agent CLIs on PATH + the exact MCP-connect
  // command per agent (URL from THIS request's origin + the session token). The
  // dashboard renders the picker (architecture.md §"Entry & agent selection").
  app.get("/api/agents", (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const mcpUrl = `${new URL(c.req.url).origin}/mcp`;
    return c.json({ agents: detectAgents(mcpUrl, token) });
  });

  // POST /api/agent — step 1 gate: connect (or disconnect) the coding agent. Body
  // `{ id }` picks a detected agent (or "manual"); an empty body clears it and falls
  // the onboarding gate back to step 1 (also clears the project + reseeds the grid).
  // The NAME is resolved server-side (never trust a client-supplied label). No token
  // or secret is ever stored here — the agent's token rides the MCP connect command.
  app.post("/api/agent", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) {
      store.setAgent(null); // also clears project
      store.setGrid(gridSeed());
      return c.json({ ok: true, agent: null });
    }
    const mcpUrl = `${new URL(c.req.url).origin}/mcp`;
    const found = detectAgents(mcpUrl, token).find((a) => a.id === body.id);
    const name = found?.name ?? (body.id === "manual" ? "guided / manual" : body.id);
    store.setAgent({ id: body.id, name });
    return c.json({ ok: true, agent: { id: body.id, name } });
  });

  // GET /api/projects — step 2 candidates: local dirs that carry a `.env.example`
  // (the manifest Ringtail is scoped to). Names + paths only, never file contents.
  app.get("/api/projects", (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    return c.json({ projects: scanProjects() });
  });

  // POST /api/project — step 2 gate: set (or clear) the active project. Body `{ path }`
  // must point at a dir with a `.env.example`; the daemon rebuilds the grid FROM that
  // project's manifest (gridFromExample) and advances to the cockpit. Empty body clears
  // the project + reseeds the grid (falls back to step 2). Names/paths only, no secrets.
  app.post("/api/project", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { path?: string };
    if (!body.path) {
      store.setProject(null);
      store.setGrid(gridSeed());
      return c.json({ ok: true, project: null });
    }
    const examplePath = join(body.path, ".env.example");
    if (!existsSync(examplePath)) {
      return c.json({ error: "no .env.example at that path" }, 400);
    }
    const project = { path: body.path, name: basename(body.path) };
    store.setProject(project);
    store.setGrid(gridFromExample(examplePath));
    return c.json({ ok: true, project });
  });

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
  const { app, token } = createDaemon({
    envLocalPath: process.env.RINGTAIL_ENV_LOCAL,
    discover: true,
  });
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
