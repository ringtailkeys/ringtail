import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getEnv } from "@ringtail/config";
import { readPlan, type PlanEntry } from "@ringtail/core";

/**
 * @ringtail/cli — the terminal surface. The public door: `run(argv)` returns an
 * exit code, so it's testable without spawning a process (src/cli.ts is the thin
 * shebang bin that calls it). Imports libs only (core + config) — type:package
 * law. NEVER prints secret VALUES: the plan and --json emit key NAMES + status.
 */

const HELP = `ringtail — provision every API key a new project needs.

Usage:
  ringtail            Print the plan (reads ./.env.example — the manifest).
  ringtail up         Boot the daemon + dashboard and open the cockpit.
  ringtail --json     Agent mode: JSON status of what's MISSING (no secret values).
  ringtail --help     Show this help.

Rocco raids each provider's official token page — one consent, then zero-touch.
Docs: ringtailkeys.com`;

/** Resolve the manifest against the project the CLI is invoked in. */
function manifestPath(): string {
  return resolve(process.cwd(), ".env.example");
}

function printPlan(entries: PlanEntry[]): void {
  console.log("Ringtail plan — credentials this project needs:");
  let section = "";
  for (const e of entries) {
    if (e.section !== section) {
      section = e.section;
      console.log(`\n  ${section}`);
    }
    console.log(`    ${e.present ? "✓" : "○"} ${e.key}${e.present ? "" : "  (missing)"}`);
  }
  const missing = entries.filter((e) => !e.present).length;
  console.log(
    `\n  ${missing}/${entries.length} to provision · one consent per provider, then zero-touch.`,
  );
}

function plan(json: boolean): number {
  const entries = readPlan(manifestPath());
  if (entries.length === 0) {
    console.error("No .env.example found in this directory — nothing to provision.");
    return 1;
  }
  if (json) {
    // Agent mode: names + section of what's missing. NEVER the values.
    const missing = entries.filter((e) => !e.present).map(({ key, section }) => ({ key, section }));
    console.log(JSON.stringify({ missing, total: entries.length }, null, 2));
    return 0;
  }
  printPlan(entries);
  return 0;
}

/** Walk up from `start` until a dir holds `services/daemon/src/index.ts` — the
 * monorepo root. ponytail: example repo is run in-tree (never published), so a
 * filesystem walk beats a bare `@ringtail/daemon` specifier that would (a) trip the
 * type:package→service boundary lint and (b) get bundled into the CLI by esbuild. */
function findRepoRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "services/daemon/src/index.ts"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Open a URL in the default browser (macOS `open`, else `xdg-open`). Best-effort. */
function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // headless / no opener — the URL is printed anyway.
  }
}

async function up(json: boolean): Promise<number> {
  // Ports come from @ringtail/config (never hardcoded).
  const { DAEMON_PORT, DASHBOARD_PORT } = getEnv();
  const daemonUrl = `http://localhost:${DAEMON_PORT}`;
  const dashboardUrl = `http://localhost:${DASHBOARD_PORT}`;

  if (json) {
    // Dry-run: report what `up` WOULD boot (no spawn) — testable + CI-safe.
    console.log(JSON.stringify({ bootDaemon: daemonUrl, openDashboard: dashboardUrl }, null, 2));
    return 0;
  }

  const root = findRepoRoot(import.meta.dir);
  if (!root) {
    console.error("Could not locate the ringtail monorepo root (services/daemon missing).");
    return 1;
  }

  console.log(`ringtail up\n  daemon    → ${daemonUrl}\n  dashboard → ${dashboardUrl}\n`);

  // Boot the daemon (MCP + SSE + /api) and the dashboard (Vite SPA). Both inherit
  // stdio so the daemon's boot line (MCP URL + token) prints straight through.
  const daemon = Bun.spawn(["bun", join(root, "services/daemon/src/index.ts")], {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const dashboard = Bun.spawn(["bun", "run", "dev"], {
    cwd: join(root, "apps/dashboard"),
    stdio: ["ignore", "inherit", "inherit"],
  });

  const stop = () => {
    daemon.kill();
    dashboard.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Wait for the daemon to answer /health, then open the dashboard.
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${daemonUrl}/health`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  openBrowser(dashboardUrl);
  console.log(`\n  dashboard opening → ${dashboardUrl}   (Ctrl-C to stop)\n`);

  // Foreground: block on the daemon; tear the dashboard down when it exits.
  const code = await daemon.exited;
  dashboard.kill();
  return code ?? 0;
}

/** Parse argv and dispatch. Returns the process exit code (async for `up`, which
 * boots long-running child processes and blocks in the foreground). */
export function run(argv: string[]): number | Promise<number> {
  const json = argv.includes("--json");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const cmd = argv.find((a) => !a.startsWith("-"));
  if (cmd === "up") return up(json);
  if (cmd && cmd !== "plan") {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    return 1;
  }
  return plan(json);
}
