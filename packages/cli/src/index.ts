import { resolve } from "node:path";
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
  ringtail up         Boot the daemon + open the dashboard (stub).
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

function up(json: boolean): number {
  // ponytail: stub — the real `up` boots services/daemon and opens the dashboard.
  // Ports come from @ringtail/config (never hardcoded), which is why the CLI
  // legitimately depends on config as well as core.
  const { DAEMON_PORT, DASHBOARD_PORT } = getEnv();
  const daemon = `http://localhost:${DAEMON_PORT}`;
  const dashboard = `http://localhost:${DASHBOARD_PORT}`;
  if (json) {
    console.log(
      JSON.stringify(
        { stub: true, wouldBootDaemon: daemon, wouldOpenDashboard: dashboard },
        null,
        2,
      ),
    );
    return 0;
  }
  console.log(
    `ringtail up (stub)\n  would boot the daemon    → ${daemon}\n  would open the dashboard → ${dashboard}\n\nNot wired yet — this scaffolds the command surface.`,
  );
  return 0;
}

/** Parse argv and dispatch. Returns the process exit code. */
export function run(argv: string[]): number {
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
