import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/**
 * Candidate local projects for step 2 (architecture.md §"Entry & agent selection" +
 * §"The env axis"). Ringtail is PROJECT-SCOPED: it reads the chosen project's
 * `.env.example` as the manifest. This scans sensible roots for directories that
 * carry one and hands the dashboard a picker.
 *
 * NAMES + PATHS only — never file contents, never a secret. `.env.example` holds
 * names only anyway, and we only check for its EXISTENCE here (never read it).
 *
 * ponytail: shallow scan (the roots themselves + their immediate children). Deep
 * recursion would crawl node_modules and every nested repo — not worth it; the user
 * can always paste an exact path for anything off the beaten track.
 */
export interface ProjectCandidate {
  path: string;
  name: string;
  hasEnvExample: boolean;
}

/** Where a `.env.example`-bearing project typically lives: the dev root's immediate
 * children + the current working directory (the repo `ringtail up` was run in). */
function defaultRoots(): string[] {
  return [join(homedir(), "Development"), process.cwd()];
}

export function scanProjects(roots: string[] = defaultRoots()): ProjectCandidate[] {
  const found = new Map<string, ProjectCandidate>();
  const add = (dir: string) => {
    if (found.has(dir)) return;
    if (existsSync(join(dir, ".env.example"))) {
      found.set(dir, { path: dir, name: basename(dir), hasEnvExample: true });
    }
  };
  for (const root of roots) {
    add(root); // the root itself (covers cwd)
    try {
      for (const d of readdirSync(root, { withFileTypes: true })) {
        if (d.isDirectory()) add(join(root, d.name));
      }
    } catch {
      // root doesn't exist / not readable — skip it, the others still scan.
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
