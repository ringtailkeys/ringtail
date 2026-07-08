import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { getEnv } from "@ringtail/config";
import {
  approveMintAction,
  connectionMap,
  defaultEnvironment,
  gridFromExample,
  gridSeed,
  provisionCredential,
  reuseKnownCredentials,
} from "@ringtail/core";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { clearSession, getSession, listRootAccounts, putRoot, putSession } from "@ringtail/store";
import { runAction } from "./action";
import { detectAgents } from "./agents";
import {
  createCheckout,
  createPortalSession,
  getEntitlement,
  recordUsage,
  sendOtp,
  verifyOtp,
} from "./control-plane";
import { buildMcpServer } from "./mcp";
import { scanProjects } from "./projects";
import { DaemonStore } from "./state";
import { applyStep } from "./submit";

/**
 * Pull the account's entitlement from the control-plane using the stored session and
 * publish it to the dashboard (value-free: email + tier + a server-side count). On any
 * failure (no session, expired, control-plane down) we fall back to signed-out so the
 * gate shows sign-in rather than a half-authed cockpit. The session token stays private.
 */
async function refreshAuth(store: DaemonStore): Promise<void> {
  // OSS edition: no account, no control-plane. Leave auth signed-out (the dashboard
  // never renders the sign-in wall in `oss`) and make ZERO outbound calls.
  if (getEnv().RINGTAIL_EDITION !== "app") return;
  const session = getSession();
  if (!session) {
    store.setAuth({ signedIn: false });
    return;
  }
  try {
    const ent = await getEntitlement(session.token);
    store.setAuth({
      signedIn: true,
      email: ent.email,
      tier: ent.tier,
      usage: ent.usage,
      expiresAt: ent.expiresAt,
    });
  } catch {
    store.setAuth({ signedIn: false });
  }
}

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
  /** Absolute path to the BUILT dashboard (`apps/dashboard/dist`). When set, the
   * daemon serves it as static assets at `/` with SPA fallback → the dashboard,
   * `/api/*`, `/events`, and `/mcp` are ALL one origin on the daemon's port
   * (architecture.md §"The daemon" — serves the dashboard AND the MCP). Unset in
   * Dev/Tilt, where Vite serves the SPA cross-origin. */
  servePath?: string;
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

  // The paywall lives ONLY in the native app. In `oss` (`ringtail up` from source) the
  // sign-in wall, entitlement/usage metering, and upgrade never activate — the daemon
  // makes ZERO control-plane calls. `apps/desktop` sets RINGTAIL_EDITION=app on its sidecar.
  const isApp = getEnv().RINGTAIL_EDITION === "app";

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

  // ── the sign-in GATE + freemium (control-plane) ────────────────────────────
  // The OSS tool has NO auth of its own — these routes proxy the LOOPBACK dashboard's
  // request to the hosted control-plane (Better Auth email-OTP + Dodo). Only an email,
  // a one-time code, or the account session token crosses that wire — NEVER a provider
  // secret. All token-gated by the loopback session token, like every other /api route.

  // POST /api/signin { email } → the control-plane emails a one-time code. Email only.
  app.post("/api/signin", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    if (!isApp) return c.json({ error: "sign-in is app-edition only" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    if (!body.email) return c.json({ error: "email required" }, 400);
    try {
      await sendOtp(body.email);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/verify { email, otp } → verify the code, persist the session PRIVATELY
  // (never surfaced), then publish the entitlement so the gate opens. The token is
  // stored to disk (0600) so a reinstall keeps you signed in — the free limit is
  // server-side regardless.
  app.post("/api/verify", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    if (!isApp) return c.json({ error: "sign-in is app-edition only" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; otp?: string };
    if (!body.email || !body.otp) return c.json({ error: "email and otp required" }, 400);
    try {
      const sessionToken = await verifyOtp(body.email, body.otp);
      putSession({ token: sessionToken, email: body.email }); // → disk, never returned
      await refreshAuth(store);
      return c.json({ ok: true }); // session token NEVER echoed back
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/signout → drop the local session (falls the gate back to sign-in). The
  // account's server-side usage count is untouched — a reinstall can't reset the limit.
  app.post("/api/signout", (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    clearSession();
    store.setAuth({ signedIn: false });
    return c.json({ ok: true });
  });

  // POST /api/checkout → a Dodo overlay checkout session URL (opened in-app, no new
  // tab). Returns the URL only; the payment happens in the Dodo overlay, then the
  // dashboard re-checks entitlement to unlock.
  app.post("/api/checkout", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    if (!isApp) return c.json({ error: "billing is app-edition only" }, 404);
    const session = getSession();
    if (!session) return c.json({ error: "not signed in" }, 401);
    try {
      return c.json(await createCheckout(session.token));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/portal → a Dodo billing-portal session URL (manage/cancel the sub, opened
  // in-app like checkout). URL only; no secret crosses. App edition + signed-in only.
  app.post("/api/portal", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    if (!isApp) return c.json({ error: "billing is app-edition only" }, 404);
    const session = getSession();
    if (!session) return c.json({ error: "not signed in" }, 401);
    try {
      return c.json(await createPortalSession(session.token));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/entitlement/refresh → re-pull entitlement (after a successful upgrade →
  // unlock). No body; publishes the fresh tier/usage over SSE.
  app.post("/api/entitlement/refresh", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    if (!isApp) return c.json({ error: "entitlement is app-edition only" }, 404);
    await refreshAuth(store);
    const { tier, limitReached } = store.snapshot().auth;
    // Clear the block once the tier is pro (the upgrade landed).
    if (tier === "pro" && limitReached) store.setLimitReached(false);
    return c.json({ ok: true, tier: tier ?? "free" });
  });

  // POST /api/step — the BROWSER paste path (architecture.md §"Step kinds · paste").
  // The value flows user → daemon → validate → @ringtail/store, NEVER through the
  // agent. Shares applyStep with the MCP submitStep tool; the response is status +
  // var NAME only (no value → check:no-leak stays green). Token-gated like /mcp.
  app.post("/api/step", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { stepId?: string; value?: string };
    if (!body.stepId) return c.json({ error: "stepId required" }, 400);
    try {
      // Pass engine opts so a paste auto-advances the next safe auto step (event-driven).
      return c.json(
        await applyStep(store, body.stepId, body.value, {
          repoName: opts.repoName ?? "ringtail",
          envLocalPath: opts.envLocalPath,
        }),
      );
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  // POST /api/root — the DASHBOARD submits a per-account ROOT key (the master key
  // that MINTS other keys). Same trust path as a paste: user → daemon → the global
  // ~/.ringtail vault; the AGENT never submits or sees a root key. Body
  // `{ providerAccount, value }`. The value is stored 0600 and NEVER echoed — the
  // response carries the provider(+account) NAME only (check:no-leak stays green).
  // Token-gated like /mcp.
  app.post("/api/root", async (c) => {
    if (bearer(c) !== token) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as {
      providerAccount?: string;
      value?: string;
    };
    if (!body.providerAccount || !body.value) {
      return c.json({ error: "providerAccount and value required" }, 400);
    }
    putRoot(body.providerAccount, body.value); // value → disk, never returned
    return c.json({ ok: true, providerAccount: body.providerAccount, roots: listRootAccounts() });
  });

  // POST /api/chat — the USER → agent direction channel. The user types in the
  // dashboard; the message is appended to the transcript (renders at once over SSE)
  // AND queued for the agent — delivered as `pendingUserMessages` piggybacked on the
  // agent's next plan/executeStep/updateStatus/authorWizard call (no poll). Intent TEXT
  // only — never a secret value (paste has its own path, POST /api/step). Token-gated.
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
    const body = (await c.req.json().catch(() => ({}))) as {
      id?: string;
      confirmed?: boolean;
      nonce?: string;
    };
    // Approve a parked consequential mint by its server nonce — the UNFORGEABLE human
    // channel. The agent never received this nonce (it went to the dashboard over SSE),
    // so it cannot self-approve the write it proposed. Executes with confirmed:true.
    if (body.nonce) {
      const result = await approveMintAction(body.nonce);
      if (result.status !== "rejected") store.clearPendingMint(body.nonce);
      // P1: the human approved a real mint → flip its grid cell to validated so the mint
      // always shows in the grid without the agent calling updateStatus. env defaults to
      // `local` (the MVP + the mintKey tool's default). ponytail: approveMintAction returns
      // only the value-free MintResult (no env); a deployed-env mint's exact cell still
      // needs updateStatus. Thread env through PendingMint/MintResult if that matters.
      if (result.status === "minted") store.markMinted(result.providerAccount, "local");
      return c.json(result);
    }
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
    // Freemium gate — APP EDITION ONLY, BEFORE any provisioning. Committing a project is
    // the unit the free tier is metered on: hit the SERVER-SIDE counter (reinstall can't
    // reset it). Not signed in → hard 401. allowed:false → block, flag limit-reached so
    // the dashboard opens the upgrade modal, don't enter the cockpit. Pro → allowed:true
    // (unlimited). In `oss` this whole block is skipped: unlimited, no control-plane call.
    // ponytail: increments once per project activation; if switching away and back
    // must not re-count, dedupe server-side by project id.
    if (isApp) {
      const session = getSession();
      if (!session) return c.json({ error: "not signed in" }, 401);
      try {
        const usage = await recordUsage(session.token);
        store.setAuth({
          ...store.snapshot().auth,
          usage: { projectsProvisioned: usage.projectsProvisioned, freeLimit: usage.freeLimit },
        });
        if (!usage.allowed) {
          store.setLimitReached(true);
          return c.json({ error: "free limit reached", ...usage }, 402);
        }
        store.setLimitReached(false);
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
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

  // ── served (prod) mode: the built dashboard, same-origin ───────────────────
  // Registered LAST so /health, /api/*, /events, /mcp all match first; only
  // unclaimed paths fall through to static files. `/` → index.html, `/assets/*`
  // → hashed bundles, and any other GET → index.html (SPA fallback). This is what
  // makes `ringtail up` ONE process on ONE origin (no Vite dev server).
  if (opts.servePath) {
    const root = opts.servePath;
    app.use("*", serveStatic({ root }));
    app.get("*", serveStatic({ path: "index.html", root }));
  }

  return { app, token, store };
}

// ── real entry: `ringtail up` boots the daemon on 127.0.0.1 and prints the token ─
if (import.meta.main) {
  const port = Number(process.env.PORT) || getEnv().DAEMON_PORT;
  // RINGTAIL_SERVE_DIST → served mode (the daemon serves the built dashboard on its
  // own port, one origin). Set by `ringtail up`; unset under Tilt (Vite serves it).
  const servePath = process.env.RINGTAIL_SERVE_DIST || undefined;
  const { app, token, store } = createDaemon({
    envLocalPath: process.env.RINGTAIL_ENV_LOCAL,
    discover: true,
    servePath,
  });
  // RINGTAIL_PROJECT → preselect the project (skips the ② picker). Must hold a
  // `.env.example`; the grid is rebuilt from it, same as POST /api/project.
  const projectPath = process.env.RINGTAIL_PROJECT;
  if (projectPath && existsSync(join(projectPath, ".env.example"))) {
    store.setProject({ path: projectPath, name: basename(projectPath) });
    store.setGrid(gridFromExample(join(projectPath, ".env.example")));
  }
  // Restore a persisted sign-in: pull the account's entitlement so a returning user
  // lands past the gate (or on sign-in if the session expired). Non-blocking.
  void refreshAuth(store);
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: app.fetch });
  const origin = `http://127.0.0.1:${server.port}`;
  // The boot line — MCP URL + session token + dashboard. Bind is 127.0.0.1 only.
  // In served mode the dashboard is same-origin on this port; else it's the Vite dev URL.
  const dashboardLine = servePath
    ? `  dashboard: ${origin}   (served here · same origin)`
    : `  dashboard: http://127.0.0.1:${getEnv().DASHBOARD_PORT}   (VITE_DAEMON_URL=${origin})`;
  console.log(
    [
      "",
      "  ringtail daemon — your keys, raided · washed · stashed",
      `  MCP:       ${origin}/mcp   (Authorization: Bearer <token>)`,
      `  events:    ${origin}/events?token=<token>`,
      dashboardLine,
      `  token:     ${token}`,
      "  bind:      127.0.0.1 only · zero telemetry",
      "",
    ].join("\n"),
  );
}
