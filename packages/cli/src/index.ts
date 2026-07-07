import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
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

/** Ringtail is bun-native (boots a `Bun.serve` daemon child, uses `Bun.spawn` /
 * `import.meta.dir`). Fail fast with an install hint instead of a cryptic
 * TypeError if someone runs the bin under plain node. */
function requireBun(): boolean {
  if (typeof Bun !== "undefined") return true;
  console.error(
    "ringtail requires bun (it boots a bun daemon). Install: https://bun.sh, then re-run.",
  );
  return false;
}

/** The live env the plan is judged against: process.env PLUS the NAMES already
 * declared in ./.env.local — a var written there is provisioned, so it must show
 * ✓, not (missing). Value-carrying lines only (a bare `KEY=` isn't provisioned).
 * ponytail: 6-line dotenv scan; parseEnvFile in @ringtail/store isn't exported. */
function liveEnv(): Record<string, string | undefined> {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return process.env;
  const merged: Record<string, string | undefined> = { ...process.env };
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (/^\s*#/.test(line)) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    const key = m?.[1];
    if (key && !merged[key]) merged[key] = m[2]?.trim();
  }
  return merged;
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
  const entries = readPlan(manifestPath(), liveEnv());
  if (json) {
    // Agent mode: names + section of what's missing. NEVER the values. No manifest
    // → an empty, still-valid plan (total: 0), never an error stream.
    const missing = entries.filter((e) => !e.present).map(({ key, section }) => ({ key, section }));
    console.log(JSON.stringify({ missing, total: entries.length }, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    // Bare `ringtail` outside a project: a helpful pointer, NOT a raw error (exit 0).
    console.log("No .env.example in this directory — nothing to provision here.\n");
    console.log(HELP);
    return 0;
  }
  printPlan(entries);
  return 0;
}

/** Walk up from `start` until a dir holds `services/daemon/src/index.ts` — the
 * monorepo root. DEV / clone-path fallback ONLY: a published package boots the
 * bundled dashboard dist instead (see `up`). ponytail: a filesystem walk beats a
 * bare `@ringtail/daemon` specifier that would (a) trip the type:package→service
 * boundary lint and (b) get bundled into the CLI by esbuild. */
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
  if (!requireBun()) return 1;

  // Two ways to find what `up` serves + boots, in priority order:
  //  1. PREBUILT (published / after `bun run build`): this package ships the built
  //     dashboard at <pkg>/dist/dashboard — no repo, no build step for a consumer.
  //  2. DEV / clone fallback: walk up to the monorepo root, serve apps/dashboard/dist
  //     (building it once if missing — it's gitignored, so a fresh clone has none).
  const bundledDist = join(import.meta.dir, "dashboard"); // dist/dashboard next to cli.js
  const root = findRepoRoot(import.meta.dir);
  const daemonEntry = root ? join(root, "services/daemon/src/index.ts") : null;
  let distDir = existsSync(join(bundledDist, "index.html"))
    ? bundledDist
    : root
      ? join(root, "apps/dashboard/dist")
      : null;

  if (!daemonEntry || !distDir) {
    // No prebuilt bundle AND not inside a clone — nothing to boot. Until the package
    // ships a bundled daemon (see PUBLISH.md), `up` needs the monorepo clone.
    console.error(
      "Could not locate the ringtail daemon. Run `up` from a clone of the monorepo " +
        "(git clone https://github.com/ringtailkeys/ringtail). See packages/cli/PUBLISH.md.",
    );
    return 1;
  }

  if (json) {
    // Dry-run: report what `up` WOULD boot (no spawn) — testable + CI-safe. ONE origin
    // now: the daemon serves the built dashboard on its own port.
    console.log(
      JSON.stringify(
        {
          origin: "http://127.0.0.1:<free-port>",
          serves: distDir,
          built: existsSync(join(distDir, "index.html")),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  // (a) Ensure the dashboard is BUILT — `ringtail up` serves it, never Vite dev. A
  // prebuilt bundle skips this; only the clone fallback ever builds, and only once.
  if (!existsSync(join(distDir, "index.html"))) {
    if (!root) {
      console.error("Prebuilt dashboard is missing and no repo to build it from.");
      return 1;
    }
    console.log("Building the dashboard (apps/dashboard/dist missing, one-time)…");
    // ponytail: a REAL kill-timer, not spawnSync's `timeout` option — bun's
    // node:child_process spawnSync IGNORES `timeout` (verified), which is exactly
    // what let the first-boot build hang forever. 5-min ceiling; a hung build is
    // 0% CPU and never returns, so any finite bound rescues `up`. Bump only if a
    // healthy cold build legitimately needs longer.
    let timedOut = false;
    const build = Bun.spawn(["bun", "run", "build"], {
      cwd: join(root, "apps/dashboard"),
      stdio: ["inherit", "inherit", "inherit"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      build.kill("SIGKILL");
    }, 300_000);
    const status = await build.exited;
    clearTimeout(timer);
    if (timedOut) {
      console.error(
        "Dashboard build timed out after 5 min (likely a hung build) — run it manually: (cd apps/dashboard && bun run build)",
      );
      return 1;
    }
    if (status !== 0 || !existsSync(join(distDir, "index.html"))) {
      console.error("Dashboard build failed — cannot serve the cockpit.");
      return 1;
    }
    distDir = join(root, "apps/dashboard/dist");
  }

  // (b) Boot the daemon in SERVED mode on a free localhost port. One process, one
  // origin: it serves the dashboard AND /api + /events + /mcp. Spawned as a child
  // (not imported) — the CLI is type:package and must not cross into a service.
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  console.log(`ringtail up\n  cockpit → ${origin}   (daemon + dashboard, one origin)\n`);

  const daemon = Bun.spawn(["bun", daemonEntry], {
    cwd: projectPath ?? root ?? undefined,
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

// Also runnable directly (the pre-publish clone path: `bun packages/cli/src/index.ts up`),
// not only via the dist/cli.js bin. import.meta.main is false when imported (tests, bin).
if (import.meta.main) {
  process.exit(await run(process.argv.slice(2)));
}
