/**
 * Compile the daemon to a standalone, self-contained binary and drop it where Tauri
 * expects its sidecar: `src-tauri/binaries/ringtaild-<rust-target-triple>`.
 *
 * `bun build --compile` embeds the Bun runtime, so the produced binary needs NO bun
 * on the user's machine — Tauri bundles it into the app and spawns it at launch. The
 * daemon reads PORT + RINGTAIL_SERVE_DIST from the env (exactly like `ringtail up`),
 * so the webview loads its origin same-origin and live.ts works unchanged.
 *
 * Tauri strips the target-triple suffix when it resolves `sidecar("ringtaild")`, so
 * the file MUST carry the host triple. We derive it from `rustc -vV` (the source of
 * truth Tauri itself uses); falling back to a platform/arch map if rustc is absent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const repoRoot = resolve(desktop, "../..");

/** The rust host triple — what Tauri appends to the sidecar name. */
function targetTriple(): string {
  const out = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  const host = out.stdout?.match(/host:\s*(\S+)/)?.[1];
  if (host) return host;
  // Fallback map (rustc missing) — covers the two shipping targets.
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  return `${arch}-unknown-linux-gnu`;
}

const triple = targetTriple();
const isWin = triple.includes("windows");
const ext = isWin ? ".exe" : "";
const outDir = join(desktop, "src-tauri", "binaries");
const outFile = join(outDir, `ringtaild-${triple}${ext}`);
const entry = join(repoRoot, "services/daemon/src/index.ts");

if (!existsSync(entry)) {
  console.error(`daemon entry not found: ${entry}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

console.log(`Compiling daemon → ${outFile}`);
const res = spawnSync("bun", ["build", "--compile", entry, "--outfile", outFile], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (res.status !== 0) {
  console.error("sidecar compile failed");
  process.exit(res.status ?? 1);
}
console.log("sidecar ready:", outFile);
