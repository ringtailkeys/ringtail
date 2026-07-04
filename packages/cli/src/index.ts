import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
  ringtail up         Boot the daemon (serving the dashboard) and open the cockpit.
  ringtail up --project <path>
                      Same, preselecting the project at <path> (skips the picker).
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

/** Open a URL in the default browser (macOS `open`, Windows `start`, else
 * `xdg-open`). Best-effort — headless boxes just read the printed URL. */
function openBrowser(url: string): void {
  const argv =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // headless / no opener — the URL is printed anyway.
  }
}

/** Grab an ephemeral free localhost port (ask the OS for :0, read it, release).
 * ponytail: tiny race between release and the daemon's bind — fine for a local,
 * single-user boot; retry-on-EADDRINUSE only if that ever bites. */
function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => res(port));
    });
  });
}

async function up(json: boolean, projectPath?: string): Promise<number> {
  const root = findRepoRoot(import.meta.dir);
  if (!root) {
    console.error("Could not locate the ringtail monorepo root (services/daemon missing).");
    return 1;
  }
  const distDir = join(root, "apps/dashboard/dist");

  if (json) {
    // Dry-run: report what `up` WOULD boot (no spawn) — testable + CI-safe. ONE origin
    // now: the daemon serves the built dashboard on its own port.
    console.log(
      JSON.stringify(
        { origin: "http://127.0.0.1:<free-port>", serves: distDir, built: existsSync(distDir) },
        null,
        2,
      ),
    );
    return 0;
  }

  // (a) Ensure the dashboard is BUILT — `ringtail up` serves it, never Vite dev.
  if (!existsSync(join(distDir, "index.html"))) {
    console.log("Building the dashboard (apps/dashboard/dist missing)…");
    const built = spawnSync("bun", ["run", "build"], {
      cwd: join(root, "apps/dashboard"),
      stdio: "inherit",
    });
    if (built.status !== 0 || !existsSync(join(distDir, "index.html"))) {
      console.error("Dashboard build failed — cannot serve the cockpit.");
      return 1;
    }
  }

  // (b) Boot the daemon in SERVED mode on a free localhost port. One process, one
  // origin: it serves the dashboard AND /api + /events + /mcp. Spawned as a child
  // (not imported) — the CLI is type:package and must not cross into a service.
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  console.log(`ringtail up\n  cockpit → ${origin}   (daemon + dashboard, one origin)\n`);

  const daemon = Bun.spawn(["bun", join(root, "services/daemon/src/index.ts")], {
    cwd: projectPath ?? root,
    env: {
      ...process.env,
      PORT: String(port),
      RINGTAIL_SERVE_DIST: distDir,
      ...(projectPath ? { RINGTAIL_PROJECT: resolve(projectPath) } : {}),
    },
    stdio: ["inherit", "inherit", "inherit"],
  });

  const stop = () => daemon.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // (c) Wait for the daemon to answer /health, then open the browser to the cockpit.
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  openBrowser(origin);
  console.log(`\n  cockpit opening → ${origin}   (Ctrl-C to stop)\n`);

  // (d) Foreground: block until the daemon exits (Ctrl-C).
  const code = await daemon.exited;
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
  if (cmd === "up") {
    // --project <path> preselects the project (else the dashboard's ② picker handles it).
    const pi = argv.indexOf("--project");
    const projectPath = pi >= 0 ? argv[pi + 1] : undefined;
    return up(json, projectPath);
  }
  if (cmd && cmd !== "plan") {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    return 1;
  }
  return plan(json);
}
