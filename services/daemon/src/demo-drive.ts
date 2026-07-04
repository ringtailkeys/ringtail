import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMockProvider, type GridRow, type Wizard } from "@ringtail/core";
import { createDaemon } from "./index";

/**
 * The DRIVER — stands in for the coding agent. It connects to the daemon as a real
 * MCP client (SDK, over Streamable HTTP, with the session token) and drives the
 * mock provider through the FULL loop, exercising the EXACT surface a real agent
 * will use: plan → renderWizard → submitStep(paste) → executeStep → updateStatus.
 *
 * Self-contained: boots its own daemon + offline mock provider in-process, so
 * `bun src/demo-drive.ts` proves the spine end-to-end with zero real cloud. The
 * real agent-picker/spawn is P2.5 — NOT built here.
 */

// A known secret the "human" pastes — must NEVER surface in any daemon → client
// message (that invariant is enforced by check:no-leak; here it just proves flow).
const PASTED_SECRET = "cf-live-token-DO-NOT-LEAK-0xSENTINEL";

const CLOUDFLARE_WIZARD: Wizard = {
  id: "wiz-cloudflare",
  title: "Connect Cloudflare",
  provider: "cloudflare",
  steps: [
    {
      id: "cf-open",
      title: "Open the API tokens page",
      description: "Create a token with Pages, Workers, and R2 edit scopes.",
      kind: "open-url",
      payload: {
        url: "https://dash.cloudflare.com/profile/api-tokens",
        scopes: ["Pages:Edit", "Workers Scripts:Edit", "R2 Storage:Edit"],
      },
      status: "pending",
    },
    {
      id: "cf-paste",
      title: "Paste your Cloudflare API token",
      description: "🔒 goes to Ringtail, not the agent.",
      kind: "paste",
      payload: { varName: "CLOUDFLARE_API_TOKEN" },
      status: "pending",
    },
    {
      id: "cf-provision",
      title: "Provision dev · staging · prod",
      description: "Mint → validate-after-mint → provision → sync.",
      kind: "auto",
      danger: "safe",
      status: "pending",
    },
  ],
};

function printGrid(grid: GridRow[], only?: string): void {
  const rows = only ? grid.filter((r) => r.provider === only) : grid;
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    `  ${pad("provider", 12)}${["local", "dev", "staging", "prod"].map((e) => pad(e, 14)).join("")}`,
  );
  for (const r of rows) {
    console.log(
      `  ${pad(r.provider, 12)}${(["local", "dev", "staging", "prod"] as const)
        .map((e) => pad(r.envs[e], 14))
        .join("")}`,
    );
  }
}

async function main(): Promise<void> {
  // Wire the offline mock provider + fake Infisical + a throwaway home/.env.local.
  const dir = mkdtempSync(join(tmpdir(), "ringtail-demo-"));
  const envLocalPath = join(dir, ".env.local");
  const mock = startMockProvider();
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.MOCK_PROVIDER_URL = mock.url;
  process.env.INFISICAL_API_URL = mock.url;
  process.env.INFISICAL_CLIENT_ID = "mock-client-id";
  process.env.INFISICAL_CLIENT_SECRET = "mock-client-secret";
  process.env.INFISICAL_PROJECT_ID = "mock-project";

  const { app, token } = createDaemon({ repoName: "ringtail", envLocalPath });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  const mcpUrl = `http://127.0.0.1:${server.port}/mcp`;

  console.log("\n── ringtail P2 · agent-drives-it (against the mock) ──");
  console.log(`  daemon : http://127.0.0.1:${server.port}  (bind 127.0.0.1 only)`);
  console.log(`  token  : ${token}`);

  const client = new Client({ name: "ringtail-demo-driver", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const res = await client.callTool({ name, arguments: args });
    const first = (res.content as Array<{ type: string; text?: string }>)?.[0];
    return JSON.parse(first?.text ?? "{}");
  };

  try {
    console.log("\n[1] plan() — the grid, fresh machine:");
    const p0 = await call("plan");
    printGrid(p0.grid as GridRow[], "cloudflare");

    console.log("\n[2] renderWizard(cloudflare) → pushed to the cockpit:");
    const w = await call("renderWizard", { wizard: CLOUDFLARE_WIZARD });
    console.log(
      `  wizard '${w.wizardId}' · steps: ${w.steps.map((s: any) => `${s.id}[${s.status}]`).join(" ")}`,
    );

    console.log("\n[3] agent flips cells to needs-consent:");
    for (const env of ["local", "dev", "staging", "prod"] as const) {
      await call("updateStatus", { provider: "cloudflare", env, status: "needs-consent" });
    }
    printGrid((await call("plan")).grid, "cloudflare");

    console.log("\n[4] submitStep(cf-open) + submitStep(cf-paste) — value goes user → daemon:");
    console.log(`  cf-open  → ${JSON.stringify(await call("submitStep", { stepId: "cf-open" }))}`);
    const paste = await call("submitStep", { stepId: "cf-paste", value: PASTED_SECRET });
    console.log(
      `  cf-paste → ${JSON.stringify(paste)}   (value never came back — names + status only)`,
    );

    console.log("\n[5] executeStep(cf-provision) — mint → validate → provision → sync:");
    const exec = await call("executeStep", { stepId: "cf-provision" });
    for (const r of exec.results as Array<{ env: string; status: string; keys: string[] }>) {
      console.log(`  ${r.env.padEnd(8)} → ${r.status}   keys: ${r.keys.join(", ") || "(none)"}`);
    }

    console.log("\n[6] updateStatus → synced across all four envs:");
    for (const env of ["local", "dev", "staging", "prod"] as const) {
      await call("updateStatus", { provider: "cloudflare", env, status: "synced" });
    }

    const final = (await call("plan")).grid as GridRow[];
    console.log("\n── final grid ──");
    printGrid(final, "cloudflare");

    const cf = final.find((r) => r.provider === "cloudflare")!;
    const allSynced = (["local", "dev", "staging", "prod"] as const).every(
      (e) => cf.envs[e] === "synced",
    );
    const wroteLocal =
      existsSync(envLocalPath) && readFileSync(envLocalPath, "utf8").includes("MOCK_API_KEY=");
    console.log(`\n  all four envs synced : ${allSynced ? "✓" : "✗"}`);
    console.log(
      `  .env.local written   : ${wroteLocal ? "✓ (keys on local disk, off the agent surface)" : "✗"}`,
    );

    if (!allSynced || !wroteLocal) throw new Error("demo did not reach synced");
    console.log("\n✓ P2 spine proven: the agent drove the full loop over MCP to synced.\n");
  } finally {
    await client.close();
    await server.stop(true);
    mock.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
