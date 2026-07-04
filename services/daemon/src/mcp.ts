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
  type Wizard,
  WizardSchema,
} from "@ringtail/core";
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
    async () => ok({ grid: store.snapshot().grid }),
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
      });
    },
  );

  // renderActions(actions) → push the mapped, LIVING action list to the cockpit.
  // Directable actions (architecture.md §"The dashboard is a conversation"): a user
  // chat ("also set up Stripe" / "skip X") is drained via pollChat, the agent re-maps,
  // and calls this again — the panel re-renders live over SSE. Each Action is schema-
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
  // (ChatChoiceSchema); a tapped pill's `value` returns via POST /api/chat → pollChat.
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

  // pollChat() → drain pending user direction (user → agent). The user's chat is
  // queued by POST /api/chat; the agent drains it here, then re-runs mapActions/
  // renderWizard/renderActions to match what the user asked. Returns intent text only.
  tool(
    server,
    "pollChat",
    {
      description:
        "Drain pending user chat (user → agent). Returns queued user messages (intent text) to act on; re-render actions/wizard to match.",
    },
    async () => ok({ messages: store.drainInbox() }),
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
      return ok({ provider, env, status });
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
    async ({ stepId, value }) => ok(applyStep(store, stepId, value)),
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
      return ok({ stepId, provider, results, failure });
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

  return server;
}
