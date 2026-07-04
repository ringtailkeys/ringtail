#!/usr/bin/env node
// The `ringtail` bin entry — the thin shebang wrapper esbuild bundles to
// dist/cli.js. All logic lives in the public door (./index) so it stays
// testable without spawning a process.
import { run } from "./index";

process.exit(await run(process.argv.slice(2)));
