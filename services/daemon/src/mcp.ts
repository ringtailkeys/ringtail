import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ActionSchema,
  GRID_ENVS,
  provisionCredential,
  WizardSchema,
  type Environment,
} from "@ringtail/core";
import { z } from "zod";
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
const DEPLOYED_ENVS: Environment[] = ["dev", "staging", "prod"];

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

  // A typed failure the tool returns on wrong-scope / failed — the recovery hook the
  // agent re-plans from. Names + a plain-language reason + the exact missing scope(s);
  // NEVER a secret value (leak-guarded).
  type EngineFailure = {
    env: string;
    status: "wrong-scope" | "failed";
    reason?: string;
    missing: string[];
  };

  // Drive the mock engine across the deployed envs; flip grid cells as it goes.
  // dev's .env.local write also backs the `local` column (local → .env.local).
  // Short-circuits on the first wrong-scope/failed env → returns a typed failure so
  // the agent can author a recovery wizard (Layer 4, never a dead end).
  // ponytail: the mock-spine seam — RINGTAIL_MOCK_RECIPE picks which fake recipe this
  // run exercises (mock · mock-badscope · mock-failprovision). The real build maps the
  // provider → its recipe; here the driver/tests flip it to prove recovery offline.
  const runEngine = async (provider: string) => {
    const recipeId = process.env.RINGTAIL_MOCK_RECIPE ?? "mock";
    const results: Array<{ env: string; status: string; keys: string[] }> = [];
    for (const env of DEPLOYED_ENVS) {
      store.setCell(provider, env, "provisioning");
      const report = await provisionCredential(recipeId, {
        env,
        repoName: opts.repoName,
        envLocalPath: opts.envLocalPath,
      });
      store.setCell(provider, env, report.status);
      if (report.wroteLocal) store.setCell(provider, "local", report.status);
      results.push({ env, status: report.status, keys: report.keys }); // NAMES only
      if (report.status === "wrong-scope" || report.status === "failed") {
        const failure: EngineFailure = {
          env,
          status: report.status,
          reason: report.reason,
          missing: report.missing,
        };
        return { results, failure };
      }
    }
    return { results, failure: null as EngineFailure | null };
  };

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
      const { results, failure } = await runEngine(provider);
      // Failure is a rendered state, not a thrown error: mark the step `failed` so the
      // wizard shows it (Rocco error pose), and hand the agent the reason to re-plan.
      store.markStep(stepId, failure ? "failed" : "done");
      return ok({ stepId, provider, results, failure });
    },
  );

  // executeAction(id) → drive a mapped action's wizard through the same executor.
  server.registerTool(
    "executeAction",
    {
      description:
        "Run a mapped action (its embedded wizard's provisioning). Returns status + key names, never values. On failure returns a typed recovery hook (reason + missing scope).",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const action = store.snapshot().actions.find((a) => a.id === id);
      if (!action) throw new Error(`unknown action: ${id}`);
      const provider = action.wizard.provider ?? "mock";
      const { results, failure } = await runEngine(provider);
      return ok({ id, provider, results, failure });
    },
  );

  return server;
}
