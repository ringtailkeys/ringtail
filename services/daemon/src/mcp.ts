import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type Action,
  ActionSchema,
  authorWizard,
  type ChatChoice,
  ChatChoiceSchema,
  GRID_ENVS,
  type GridEnv,
  listConnectors,
  type MintAction,
  MintActionSchema,
  proposeMintAction,
  proposeMintViaBrowser,
  proposeProvision,
  proposeRotateAction,
  type RotateAction,
  RotateActionSchema,
  type Wizard,
  WizardSchema,
} from "@ringtail/core";
import { listConnectedProviders } from "@ringtail/store";
import { z } from "zod";
import { runAction, runEngine } from "./action";
import { applyStep } from "./submit";
import type { DaemonStore } from "./state";

/**
 * The MCP surface — the EXACT tools a real coding agent drives (architecture.md
 * §"MCP tools"). Every tool is the generative-UI vocabulary: the agent supplies
 * structured content (names + status + wizards), the daemon owns the pixels and
 * the creds. THE GUARANTEE, enforced here:
 *
 *   - NO tool returns a secret value. Responses carry key NAMES + status only.
 *   - `submitStep` is the ONLY inbound value path (user → daemon); the value is
 *     validated + stored to disk and NEVER echoed back.
 *   - Every agent-supplied Wizard is zod-validated (WizardSchema) → malformed is
 *     rejected before the daemon touches it.
 *
 * Event-driven, NO polling: pending user direction (typed in the dashboard chat)
 * piggybacks on the return of the common tools (`plan`/`executeStep`/`updateStatus`/
 * `authorWizard`) as `pendingUserMessages` — INTENT TEXT ONLY, never a value — so the
 * agent picks up steering on its next natural tool call without a dedicated poll tool.
 * A `paste` to `submitStep` auto-advances the next safe auto step in the daemon itself.
 *
 * P2 drives the OFFLINE mock engine (`provisionCredential("mock", …)`) so the whole
 * UX is proven with zero real cloud. The grid provider label (e.g. "cloudflare")
 * is cosmetic; the engine underneath is the deterministic mock.
 */

const CREDENTIAL_STATUS = z.enum([
  "missing",
  "needs-consent",
  "validating",
  "validated",
  "wrong-scope",
  "provisioning",
  "synced",
  "failed",
]);

/** Grid columns → the sink env axis. `local` is the .env.local disk sink; the three
 * deployed envs are Infisical-only. The mock `dev` run is what writes .env.local,
 * so it backs the `local` cell (see runEngine). */
const GRID_ENV = z.enum(GRID_ENVS);

/** Wrap any value-free result as an MCP text content block (client JSON-parses it).
 * ponytail: text-content JSON over an outputSchema — one line, no schema plumbing,
 * and the leak-guard scans the same string the client receives. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

/**
 * Typed wrapper around `server.registerTool`.
 *
 * ponytail: passing our zod schemas straight to `registerTool` makes tsc infer each
 * DEEP schema type (WizardSchema → nested StepSchema[], ActionSchema → nested Wizard)
 * and then check it against the SDK's `AnySchema = z3.ZodTypeAny | z4.$ZodType` union.
 * That check chases zod's self-referential `_refinement()` → `ZodEffects` → `ZodType`
 * chain and recurses without bottoming out — `tsc` builds a 2.28 GB type graph and OOMs
 * (fired on EVERY tool, even primitive-only ones). This wrapper stops the inference at the
 * boundary (see the cast in the body) and hands the real arg type back via the explicit
 * `<A>` generic, so call sites stay typed. The schema objects reach `registerTool`
 * byte-for-byte unchanged, so runtime validation (and THE GUARANTEE) is identical — only
 * the compile-time inference path changed.
 */
function tool<A>(
  server: McpServer,
  name: string,
  config: { description: string; inputSchema?: z.ZodRawShape },
  cb: (args: A) => CallToolResult | Promise<CallToolResult>,
): void {
  // Call through a widened signature so tsc NEVER instantiates registerTool's `InputArgs`
  // generic. That inference is the actual bomb: it checks the schema type against the SDK's
  // `AnySchema = z3.ZodTypeAny | z4.$ZodType` union, which chases zod's self-referential
  // `_refinement()`/`ZodEffects` chain and detonates the type graph (→ 2.28 GB, tsc OOM).
  // Runtime is untouched — the real `registerTool` still receives the real schema + handler.
  (server.registerTool as (n: string, c: unknown, h: unknown) => void)(name, config, cb);
}

export function buildMcpServer(
  store: DaemonStore,
  opts: { repoName: string; envLocalPath?: string },
): McpServer {
  const server = new McpServer({ name: "ringtail", version: "0.2.0" });

  // The execute side (runEngine / runAction) lives in ./action, shared with the
  // browser approve route so every execution routes through ONE set of gates.
  const engineOpts = { repoName: opts.repoName, envLocalPath: opts.envLocalPath };

  // plan() → the live grid (providers × local/dev/staging/prod). Names + status.
  tool(
    server,
    "plan",
    {
      description:
        "Scan the project → the credential grid (providers × local/dev/staging/prod). Key NAMES + status, never values.",
    },
    async () => ok({ grid: store.snapshot().grid, pendingUserMessages: store.drainInbox() }),
  );

  // renderWizard(wizard) → validated UI state pushed to the dashboard.
  tool<{ wizard: Wizard }>(
    server,
    "renderWizard",
    {
      description:
        "Push a setup wizard to the cockpit. The Wizard is schema-validated; malformed is rejected.",
      inputSchema: { wizard: WizardSchema },
    },
    async ({ wizard }) => {
      store.setWizard(wizard);
      return ok({
        wizardId: wizard.id,
        provider: wizard.provider,
        steps: wizard.steps.map((s) => ({ id: s.id, kind: s.kind, status: s.status })),
      });
    },
  );

  // authorWizard(provider) → the RECIPE FAST-PATH. The agent names a curated provider
  // and the daemon derives the on-brand 1-2-3 setup wizard from that recipe's metadata
  // (open-url → paste → provision), pushes it to the cockpit, and returns names/kinds
  // only. This is the deterministic counterpart to an agent-authored (renderWizard)
  // wizard for the long tail — together with plan() it covers the whole manifest.
  tool<{ provider: string }>(
    server,
    "authorWizard",
    {
      description:
        "Author the curated recipe's setup wizard for a provider (open-url → paste → provision) and push it to the cockpit. Returns step names + kinds, never values.",
      inputSchema: { provider: z.string().min(1) },
    },
    async ({ provider }) => {
      const wizard = authorWizard(provider);
      store.setWizard(wizard);
      return ok({
        wizardId: wizard.id,
        provider: wizard.provider,
        steps: wizard.steps.map((s) => ({ id: s.id, kind: s.kind, status: s.status })),
        pendingUserMessages: store.drainInbox(),
      });
    },
  );

  // renderActions(actions) → push the mapped, LIVING action list to the cockpit.
  // Directable actions (architecture.md §"The dashboard is a conversation"): a user
  // chat ("also set up Stripe" / "skip X") rides back as `pendingUserMessages` on the
  // next plan/executeStep/updateStatus/authorWizard call; the agent re-maps and calls
  // this again — the panel re-renders live over SSE. Each Action is schema-
  // validated (WizardSchema nested), NEVER carries a value (it's names + wizard steps).
  tool<{ actions: Action[] }>(
    server,
    "renderActions",
    {
      description:
        "Push the mapped action list to the cockpit (the living layer-2 panel). Each Action is schema-validated; re-call it to add/remove/adjust as the user steers.",
      inputSchema: { actions: z.array(ActionSchema) },
    },
    async ({ actions }) => {
      store.setActions(actions);
      return ok({ actions: actions.map((a) => ({ id: a.id, title: a.title, danger: a.danger })) });
    },
  );

  // mapActions(actions) → the LAYER-2 map entry (architecture.md §"Map the actions").
  // The agent maps the repo-specific + cross-tool next steps now possible (domain→CF,
  // Infisical→CF binding, a Neon branch per env, the R2 bucket your code references)
  // and submits them here. Each Action is zod-validated (ActionSchema, wizard nested)
  // → malformed is REJECTED at the boundary; the daemon stores them as the living
  // action panel and echoes back the validated set (names/intent + prerequisites +
  // danger + executor). NEVER a secret value. renderActions is the directable re-render;
  // mapActions is the initial map that returns the full validated Action[].
  tool<{ actions: Action[] }>(
    server,
    "mapActions",
    {
      description:
        "Map the repo-specific + cross-tool next steps into the actions panel. Each Action is schema-validated (malformed rejected). Returns the validated Action[] (names + prerequisites + danger + executor), never values.",
      inputSchema: { actions: z.array(ActionSchema) },
    },
    async ({ actions }) => {
      store.setActions(actions);
      return ok({
        actions: actions.map((a) => ({
          id: a.id,
          title: a.title,
          why: a.why,
          prerequisites: a.prerequisites,
          danger: a.danger,
          executor: a.executor,
        })),
      });
    },
  );

  // sendChat(message, choices?) → agent → user. The DIRECTION channel, relayed through
  // the daemon to the dashboard panel over SSE. Intent/TEXT only — the agent never puts
  // (or has) a secret value here; paste still bypasses the agent (user → daemon).
  // Optional `choices` render as tappable pills (Delulus-chat style): "here are your
  // next moves" arrives as choices, not a wall of text. Each choice is schema-validated
  // (ChatChoiceSchema); a tapped pill's `value` returns via POST /api/chat and rides
  // back to the agent as `pendingUserMessages` on its next tool call.
  tool<{ message: string; choices?: ChatChoice[] }>(
    server,
    "sendChat",
    {
      description:
        "Say something to the user in the dashboard chat (agent → user), optionally with tappable choice pills (next moves). Text/intent only — labels + reply values, never a secret value.",
      inputSchema: { message: z.string().min(1), choices: z.array(ChatChoiceSchema).optional() },
    },
    async ({ message, choices }) => {
      store.sendAgentMessage(message, choices);
      return ok({ role: "agent", delivered: true, choices: choices?.length ?? 0 });
    },
  );

  // updateStatus(provider, env, status) → flip one grid cell.
  tool<{ provider: string; env: GridEnv; status: z.infer<typeof CREDENTIAL_STATUS> }>(
    server,
    "updateStatus",
    {
      description: "Flip one grid cell to a credential status.",
      inputSchema: { provider: z.string().min(1), env: GRID_ENV, status: CREDENTIAL_STATUS },
    },
    async ({ provider, env, status }) => {
      store.setCell(provider, env, status);
      return ok({ provider, env, status, pendingUserMessages: store.drainInbox() });
    },
  );

  // submitStep(stepId, value?) — the ONE inbound value path. For a `paste` step the
  // VALUE arrives here (user → daemon), is validated + stored to disk, and the
  // response carries only the var NAME + status. The value NEVER crosses back out.
  tool<{ stepId: string; value?: string }>(
    server,
    "submitStep",
    {
      description:
        "Complete a wizard step. For a paste step the value flows user → Ringtail (validated + stored), never echoed. Returns status + var name only.",
      inputSchema: { stepId: z.string().min(1), value: z.string().min(1).optional() },
    },
    async ({ stepId, value }) => ok(await applyStep(store, stepId, value, engineOpts)),
  );

  // executeStep(stepId) → the daemon runs the mock loop (mint → validate-after-mint
  // → provision → sync) with the stored creds. Returns status + key names only.
  tool<{ stepId: string }>(
    server,
    "executeStep",
    {
      description:
        "Run an auto step: the daemon provisions with the stored creds and syncs. Returns status + key names, never values.",
      inputSchema: { stepId: z.string().min(1) },
    },
    async ({ stepId }) => {
      store.markStep(stepId, "active");
      const provider = store.snapshot().wizard?.provider ?? "mock";
      const { results, failure } = await runEngine(store, provider, engineOpts);
      // Failure is a rendered state, not a thrown error: mark the step `failed` so the
      // wizard shows it (Rocco error pose), and hand the agent the reason to re-plan.
      store.markStep(stepId, failure ? "failed" : "done");
      return ok({ stepId, provider, results, failure, pendingUserMessages: store.drainInbox() });
    },
  );

  // executeAction(id, confirmed?) → run a mapped action through the gates (prereqs →
  // hard-confirm → dispatch). A `destructive` action (domain→CF NS swap) refuses to
  // run until `confirmed:true` — the agent TRIGGERS, the human hard-confirms, the
  // daemon EXECUTES with the stored creds. Returns names + status only, never values;
  // a blocked/needs-confirm/failure comes back as a typed, rendered state.
  tool<{ id: string; confirmed?: boolean }>(
    server,
    "executeAction",
    {
      description:
        "Run a mapped action (typed executor or its wizard's provisioning) with the stored creds. A destructive action is refused unless confirmed:true (hard-confirm, never one-click). Returns status + key names, never values.",
      inputSchema: { id: z.string().min(1), confirmed: z.boolean().optional() },
    },
    async ({ id, confirmed }) => ok(await runAction(store, id, { ...engineOpts, confirmed })),
  );

  // mintKey(action, env?, confirmed?) → THE GENERIC dynamic executor. The agent
  // AUTHORS an HTTP action inline ({ providerAccount, method, url, headers with
  // {{ROOT}}, body?, extract? }); the daemon resolves the root key from the vault,
  // ENFORCES the domain allowlist (a non-allowlisted host is rejected before any
  // HTTP), runs the call, and — if `extract` names a minted secret — files it in the
  // sink under `ringtail/<repo>/<env>/<provider>` naming. One path covers mint,
  // read-only permission-check (no extract), and cross-provider wire. Returns
  // `{ providerAccount, varName?, status, reason? }` — NEVER a value (root or minted).
  // Every root-spending WRITE (DELETE/PUT/PATCH, or a POST that substitutes {{ROOT}})
  // is consequential and can only be PROPOSED: the daemon parks it under a server nonce,
  // routes that nonce to the dashboard over SSE (NEVER back to the agent), and returns
  // `needs-confirm` + a public id. It executes ONLY when a human posts the nonce to
  // POST /api/action — so the agent that authored the action can never self-approve it.
  // A read-only probe (GET, or a POST that doesn't touch {{ROOT}}) still auto-runs.
  tool<{ action: MintAction; env?: GridEnv }>(
    server,
    "mintKey",
    {
      description:
        "Run an agent-authored provisioning action (mint / permission-check / wire) with the stored root key. The URL host must be allowlisted for the provider (else rejected before any HTTP); a minted secret lands in the sink and only its var NAME comes back. A root-spending write (DELETE/PUT/PATCH or a {{ROOT}} POST) is consequential: it comes back needs-confirm and is parked for a human to approve in the dashboard — the agent cannot self-confirm. Never returns a secret value.",
      inputSchema: {
        action: MintActionSchema,
        env: GRID_ENV.optional(),
      },
    },
    async ({ action, env }) => {
      // Target the ACTIVE project's .env.local (chosen in step 2), not the daemon's
      // boot-time cwd default — else a local mint writes nowhere the user picked.
      const project = store.snapshot().project;
      const { result, pending } = await proposeMintAction(action, {
        ...engineOpts,
        ...(project ? { envLocalPath: join(project.path, ".env.local") } : {}),
        env: env ?? "local",
      });
      // A consequential action is parked: route the unforgeable nonce to the dashboard
      // over SSE (never back to the agent). The agent only gets `needs-confirm` + id.
      if (pending) store.addPendingMint(pending);
      // P1: a mint that AUTO-RAN (non-consequential) already landed its key — flip its
      // grid cell now. A consequential mint returns needs-confirm here and is flipped
      // after the human approves (index.ts POST /api/action), not on this call.
      if (result.status === "minted") store.markMinted(result.providerAccount, env ?? "local");
      return ok({ ...result, pendingUserMessages: store.drainInbox() });
    },
  );

  // rotateKey(rotate, env?) → ROTATE a credential (PRD Phase 2). The agent authors
  // `{ varName, mint, revoke }`: `mint` is a fresh scoped-key mint template (reuses the guided/
  // multi-root mint machinery — its extract fills `varName`, its `extract.idPath` names the new
  // key's id); `revoke` is the OLD-key delete (its url/body may carry {{OLD_KEY_ID}}, filled
  // daemon-side from the stored old key id; headers carry {{ROOT}}). A rotation is inherently
  // consequential (mint AND revoke spend the root key), so it comes back `needs-confirm` and is
  // parked under an unforgeable nonce — the agent can never self-approve. When the HUMAN approves
  // the nonce (POST /api/action), the daemon runs the whole atomic rotate LOCALLY:
  //   mint-new → reconfigure the sink → (optional validate) → revoke-old,
  // with SAFE rollback (mint/sink fail → abort + restore the old key, no revoke; revoke fail →
  // `partial`: new key live, "revoke the old one manually"). Returns names + status only, NEVER a
  // value (old or minted) — the whole rotation is daemon-local.
  tool<{ rotate: RotateAction; env?: GridEnv }>(
    server,
    "rotateKey",
    {
      description:
        "Rotate a credential: mint a fresh scoped key, switch the sink to it, then revoke the old key — as one human-approved, atomic operation with safe rollback. The agent authors { varName, mint, revoke }; a rotation is consequential so it comes back needs-confirm and is parked for a human (the agent cannot self-approve). On failure it rolls back to the old working key (abort) or reports the old key must be revoked manually (partial). Never returns a secret value (old or minted).",
      inputSchema: { rotate: RotateActionSchema, env: GRID_ENV.optional() },
    },
    async ({ rotate, env }) => {
      const project = store.snapshot().project;
      const { result, pending } = await proposeRotateAction(rotate, {
        ...engineOpts,
        ...(project ? { envLocalPath: join(project.path, ".env.local") } : {}),
        env: env ?? "local",
      });
      if (pending) store.addPendingMint(pending);
      return ok({ ...result, pendingUserMessages: store.drainInbox() });
    },
  );

  // mintViaBrowser(provider, varName, env?) → BROWSER MINT (Envoyage), the no-mint-API path. For a
  // DASHBOARD-ONLY provider (no management API to mint a token), the daemon drives the provider's
  // web console with a real browser to create + read back the key. It drives HEADLESS and STOPS at
  // any genuine human wall (login / CAPTCHA / OTP): the human solves it in the LIVE VIEW — the
  // agent is STRUCTURALLY blind to the password (Envoyage blanks the screenshot on a password
  // page). A browser mint creates a real credential, so it is consequential: it comes back
  // needs-confirm and is parked under an unforgeable nonce — the agent cannot self-approve. On the
  // human's approval the daemon drives the mint locally and closes the loop through the SAME
  // validate + sink as an API mint. The minted value never leaves the daemon; only the var NAME +
  // status come back. OFF unless RINGTAIL_BROWSER_MODE is local|cloud.
  tool<{ provider: string; varName: string; env?: GridEnv }>(
    server,
    "mintViaBrowser",
    {
      description:
        "Mint a credential for a DASHBOARD-ONLY provider (no mint-API) by driving its web console with a browser (Envoyage). Ringtail drives headless and stops at any human wall (login/CAPTCHA/OTP) — the human solves it in the live view; the agent never sees the password. Consequential: comes back needs-confirm and is parked for a human to approve (the agent cannot self-approve). On approval the daemon drives the mint locally and files the key through the same validate + sink as an API mint. Never returns a secret value.",
      inputSchema: {
        provider: z.string().min(1),
        varName: z.string().min(1),
        env: GRID_ENV.optional(),
      },
    },
    async ({ provider, varName, env }) => {
      const project = store.snapshot().project;
      const { result, pending } = await proposeMintViaBrowser(provider, varName, {
        ...engineOpts,
        ...(project ? { envLocalPath: join(project.path, ".env.local") } : {}),
        env: env ?? "local",
      });
      if (pending) store.addPendingMint(pending);
      return ok({ ...result, pendingUserMessages: store.drainInbox() });
    },
  );

  // provisionProject(mints, vars?, env?) → THE BATCH ORCHESTRATOR (the North Star). "A new
  // project provisions itself." The agent authors ONE batch of mint/wire actions — one per var
  // that self-provisions from a connected root (each a normal mintKey template: a {{ROOT}} mint
  // with `extract`, or a wire action like GoDaddy set-nameservers with no `extract`) — plus the
  // project's full `vars` list (defaults to the grid's). The daemon parks the WHOLE batch under a
  // SINGLE unforgeable nonce ("provision these N keys for <project>?"), and classifies the vars
  // NOT in the batch with the value-free planner: mint-from-root · needs-root · guided-paste ·
  // skip (a non-secret resource like DATABASE_URL is flagged, never faked). It returns
  // needs-confirm + the value-free plan + the parked list — NEVER a value. On the human's ONE
  // approval (POST /api/action with the nonce) every action runs through the same mint gate; each
  // var reports its own value-free result (minted / ok / no-root / failed). The agent can never
  // self-approve (it never receives the nonce). A structurally-doomed action rejects the batch up
  // front rather than nagging a human to approve garbage.
  tool<{ mints: MintAction[]; vars?: string[]; env?: GridEnv }>(
    server,
    "provisionProject",
    {
      description:
        "Provision a whole project from your connected roots under ONE human approval. The agent authors a batch of mint/wire actions (one per self-provisioning var) + the project's var list; the daemon parks the whole batch under a single nonce and classifies the rest (mint-from-root / needs-root / guided-paste / skip). Returns needs-confirm + the value-free plan, never a value. A human approves the one nonce in the dashboard — the agent cannot self-approve.",
      inputSchema: {
        mints: z.array(MintActionSchema),
        vars: z.array(z.string()).optional(),
        env: GRID_ENV.optional(),
      },
    },
    async ({ mints, vars, env }) => {
      const snap = store.snapshot();
      const project = snap.project;
      // Default the var list to the ACTIVE project's grid (built from its `.env.example`).
      const varList = vars ?? snap.grid.flatMap((r) => r.envVars);
      const { result, pending } = await proposeProvision(
        { mints, vars: varList, ...(project ? { project: project.name } : {}) },
        {
          ...engineOpts,
          ...(project ? { envLocalPath: join(project.path, ".env.local") } : {}),
          env: env ?? "local",
        },
      );
      // Park the batch → its nonce rides the SSE snapshot to the dashboard (never the agent).
      if (pending) store.addPendingMint(pending);
      return ok({ ...result, pendingUserMessages: store.drainInbox() });
    },
  );

  // listConnectors() → the agent-guided onboarding surface (PRD §4.9). The agent can
  // see which providers support the OAuth "Connect" flow, which are already connected,
  // which still need client credentials, and the signup / api-keys URLs to send the user
  // to. VALUE-FREE: names + urls + scopes + booleans only — never a token. The dashboard
  // drives the actual connect (POST /api/connect/start opens the authorizeUrl); this just
  // lets the agent say "sign up / connect here".
  tool(
    server,
    "listConnectors",
    {
      description:
        "List the OAuth providers the user can connect (PRD §4.9): id, connected?, needsClientCreds?, scopes, and signup / api-keys URLs to guide the user. Also returns already-connected providers (names + scopes + expiry). Never returns a token.",
    },
    async () => ok({ connectors: listConnectors(), connected: listConnectedProviders() }),
  );

  return server;
}
