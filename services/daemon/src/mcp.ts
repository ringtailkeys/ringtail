import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ActionSchema, GRID_ENVS, WizardSchema } from "@ringtail/core";
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

export function buildMcpServer(
  store: DaemonStore,
  opts: { repoName: string; envLocalPath?: string },
): McpServer {
  const server = new McpServer({ name: "ringtail", version: "0.2.0" });

  // The execute side (runEngine / runAction) lives in ./action, shared with the
  // browser approve route so every execution routes through ONE set of gates.
  const engineOpts = { repoName: opts.repoName, envLocalPath: opts.envLocalPath };

  // plan() → the live grid (providers × local/dev/staging/prod). Names + status.
  server.registerTool(
    "plan",
    {
      description:
        "Scan the project → the credential grid (providers × local/dev/staging/prod). Key NAMES + status, never values.",
    },
    async () => ok({ grid: store.snapshot().grid }),
  );

  // renderWizard(wizard) → validated UI state pushed to the dashboard.
  server.registerTool(
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

  // renderActions(actions) → push the mapped, LIVING action list to the cockpit.
  // Directable actions (architecture.md §"The dashboard is a conversation"): a user
  // chat ("also set up Stripe" / "skip X") is drained via pollChat, the agent re-maps,
  // and calls this again — the panel re-renders live over SSE. Each Action is schema-
  // validated (WizardSchema nested), NEVER carries a value (it's names + wizard steps).
  server.registerTool(
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
  server.registerTool(
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

  // sendChat(message) → agent → user. The DIRECTION channel, relayed through the
  // daemon to the dashboard panel over SSE. Intent/TEXT only — the agent never puts
  // (or has) a secret value here; paste still bypasses the agent (user → daemon).
  server.registerTool(
    "sendChat",
    {
      description:
        "Say something to the user in the dashboard chat (agent → user). Text/intent only, never a secret value.",
      inputSchema: { message: z.string().min(1) },
    },
    async ({ message }) => {
      store.sendAgentMessage(message);
      return ok({ role: "agent", delivered: true });
    },
  );

  // pollChat() → drain pending user direction (user → agent). The user's chat is
  // queued by POST /api/chat; the agent drains it here, then re-runs mapActions/
  // renderWizard/renderActions to match what the user asked. Returns intent text only.
  server.registerTool(
    "pollChat",
    {
      description:
        "Drain pending user chat (user → agent). Returns queued user messages (intent text) to act on; re-render actions/wizard to match.",
    },
    async () => ok({ messages: store.drainInbox() }),
  );

  // updateStatus(provider, env, status) → flip one grid cell.
  server.registerTool(
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
  server.registerTool(
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
  server.registerTool(
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
  server.registerTool(
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
