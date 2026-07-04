import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GRID_ENVS, provisionCredential, WizardSchema, type Environment } from "@ringtail/core";
import { putCredential } from "@ringtail/store";
import { z } from "zod";
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

  // Drive the mock engine across the deployed envs; flip grid cells as it goes.
  // dev's .env.local write also backs the `local` column (local → .env.local).
  const runEngine = async (provider: string) => {
    const results: Array<{ env: string; status: string; keys: string[] }> = [];
    for (const env of DEPLOYED_ENVS) {
      store.setCell(provider, env, "provisioning");
      const report = await provisionCredential("mock", {
        env,
        repoName: opts.repoName,
        envLocalPath: opts.envLocalPath,
      });
      store.setCell(provider, env, report.status);
      if (report.wroteLocal) store.setCell(provider, "local", report.status);
      results.push({ env, status: report.status, keys: report.keys }); // NAMES only
    }
    return results;
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
    async ({ stepId, value }) => {
      const step = store.findStep(stepId);
      if (step.kind === "paste") {
        if (!value) throw new Error(`paste step ${stepId} requires a value`);
        const varName = step.payload?.varName ?? stepId;
        // value → disk (@ringtail/store), NEVER into the snapshot or the response.
        putCredential(varName, {
          value,
          provider: store.snapshot().wizard?.provider ?? "unknown",
          updatedAt: new Date().toISOString(),
        });
        store.markStep(stepId, "done");
        return ok({ stepId, varName, status: "done" }); // names + status only
      }
      store.markStep(stepId, "done");
      return ok({ stepId, status: "done" });
    },
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
      const results = await runEngine(provider);
      store.markStep(stepId, "done");
      return ok({ stepId, provider, results });
    },
  );

  // executeAction(id) → drive a mapped action's wizard through the same executor.
  server.registerTool(
    "executeAction",
    {
      description:
        "Run a mapped action (its embedded wizard's provisioning). Returns status + key names, never values.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const action = store.snapshot().actions.find((a) => a.id === id);
      if (!action) throw new Error(`unknown action: ${id}`);
      const provider = action.wizard.provider ?? "mock";
      const results = await runEngine(provider);
      return ok({ id, provider, results });
    },
  );

  return server;
}
