#!/usr/bin/env bun
// The `ringtail` bin entry — the thin shebang wrapper esbuild bundles to
// dist/cli.js. Ringtail is bun-native: it boots the daemon (a `Bun.serve`
// service) as a `bun` child and uses `import.meta.dir` + `Bun.spawn`, so the
// shebang commits to bun. All logic lives in the public door (./index) so it
// stays testable without spawning a process.
import { run } from "./index";

process.exit(await run(process.argv.slice(2)));
