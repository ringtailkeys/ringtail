# Ringtail 🦝

**The OSS raccoon that raids the token pages so you don't.**

Ringtail is a **local, open-source, agent-orchestrated credential-provisioning tool**. Rocco —
your coding agent's little raccoon — reads `.env.example` as the shopping list, raids each
provider's token page via their **official APIs** (never browser-bots), scope-validates every
key, and stashes it into `.env.local` **and** Infisical across your environments. **One human
"allow" per provider, then zero-touch forever.**

The anti-vault: instead of a cold enterprise locker you fill by hand, a competent little bandit
goes and gets the keys for you — while your agent conducts and **never sees a single value.**

Canonical home: **[ringtailkeys.com](https://ringtailkeys.com)** · Docs:
**[docs.ringtailkeys.com](https://docs.ringtailkeys.com)** · CLI: `ringtail`

---

## Quickstart

Ringtail isn't published to a package registry yet — run it from the repo:

```bash
git clone https://github.com/ringtailkeys/ringtail
cd ringtail
bun install
bun packages/cli/src/index.ts up
```

`… up` boots the local **daemon**, opens the **dashboard**, and detects the coding-agent CLIs
on your PATH. Nothing installs globally; nothing phones home. (Run the bare command without
`up` — `bun packages/cli/src/index.ts` — to just print the plan.)

Want the full dev environment (daemon + dashboard + docs + storybook)? Use Tilt — never
`tilt up` directly:

```bash
bun install
./tilt_up.sh            # daemon + dashboard + docs + storybook, via portless
```

That brings the served roles up on stable, named URLs (no pinned ports):

| URL | What |
| --- | --- |
| `dashboard.ringtail.localhost:1355` | the cockpit (Vite SPA) |
| `api.ringtail.localhost:1355` | the daemon (`/health` · `/api/status` · `/mcp`) |
| `docs.ringtail.localhost:1355` | the docs site (Fumadocs) |
| `storybook.ringtail.localhost:1355` | the Night Shift design system + flows |

---

## The first run — ①②③

<table>
<tr><td>

### ① Connect your coding agent

Ringtail detects `claude`, `codex`, `cursor`, and `gemini` on your PATH and hands you the exact
command to register the daemon as an MCP server — the URL and a loopback **session token**
filled in. Paste it into your agent and it starts driving. No agent on PATH? Pick
**guided / manual** and drive the wizard yourself.

The connection is MCP over a loopback token — **never a secret value.**

</td></tr>
<tr><td>

### ② Choose your local project

Ringtail is **project-scoped**: it reads the chosen project's `.env.example` as the manifest and
builds the grid from it (providers × `local · dev · staging · prod`). Pick a detected project or
paste a path. **Names and paths only** — no file contents, nothing secret.

</td></tr>
<tr><td>

### ③ Watch the cockpit

The agent reads the manifest and plans the raid. You make only the calls a human must — a
consent click, a paste, an approval on a destructive action — and the agent automates the rest:
**mint → validate → provision → sync**, one key fanned out per environment into `.env.local`
(local) and Infisical (dev/staging/prod). Cells flip green as it works.

This is the point: Ringtail is **not a form you fill, it's an agent that does the work while you
watch.**

</td></tr>
</table>

Full walkthrough: **[docs.ringtailkeys.com/docs/guides/connect-your-agent](https://docs.ringtailkeys.com/docs/guides/connect-your-agent)**.

---

## 🔒 The guarantee — the agent never sees your secrets

This is the spine of the product, and it is an **enforced, verifiable invariant** — not a
promise. Your coding agent orchestrates the whole flow; it never holds a value.

**The mechanism.** A pasted key flows **you → the daemon → `libs/store`**, and never crosses the
agent's MCP boundary. There is *no MCP tool that returns a secret value* — the agent's entire
surface is key **names** + statuses + the wizard/action content it authors. When the daemon
provisions, **it** makes the API calls with the stored creds and returns *status, not values*.
There is literally no code path from a stored secret to the agent.

- 🏠 **Local** — runs on your machine, keys stored in `~/.ringtail` (mode `0600`).
- 📖 **OSS** — this repo (`ringtailkeys/ringtail`) is public. Don't trust us — read it.
- 🚫 **Zero telemetry** — no analytics, no phone-home, ever. Trust is the product.

**Enforced, not asserted.** A leak-guard scans the whole MCP + SSE surface and fails the build if
any daemon→agent message ever carries a value:

```bash
bun run check:no-leak     # drives the full loop, asserts no value ever leaves the daemon
```

It runs in [CI](.github/workflows/ci.yml) on every push and PR — the guarantee can't silently
rot. Full threat model + how to audit it: **[SECURITY.md](./SECURITY.md)**.

> *"your keys. my paws only."* — Rocco

---

## The four layers

The whole product, in order. Layers 1–2 exist only to make layer 3 possible; layer 4 makes sure
none of them dead-end.

1. **Get the root keys** — the only place a human is needed. A wizard (`open-url` → `paste` →
   `confirm`) + local discovery + the recipe fast-path. One consent per provider, ever.
2. **Map the actions** — the agent maps repo-specific + cross-tool next steps: a Neon branch per
   env, Infisical → CF Pages bindings, a Workers binding, point a domain, create the R2 bucket
   your code already references.
3. **Automate it — the point.** With the root grant, everything downstream is `auto`: the agent
   orchestrates a chain of API calls and the work just happens. Safe actions run themselves; only
   destructive ones (domain transfer, NS swap, delete) hard-confirm.
4. **Recover** — a wrong scope or a failed action is a *first-class state*, not an exception.
   Ringtail explains it in plain language and routes to the fix; the agent re-plans into a
   recovery wizard. Every failure surfaces a cause *and* a next step.

---

## Structure — four buckets

The [builders-stack](https://github.com/ringtailkeys) "run vs ship" taxonomy, boundaries enforced
by Nx tags + `@nx/enforce-module-boundaries` (an illegal import is a lint error):

| Path | Served to | What |
| --- | --- | --- |
| `apps/dashboard` | humans | Vite+React local cockpit — a providers×envs connection grid |
| `apps/docs` | humans | Fumadocs docs site → docs.ringtailkeys.com |
| `services/daemon` | machines (a URL) | Hono; the MCP server (`/mcp`), SSE `/events`, paste sink |
| `libs/config` | — (shared) | env schema / `getEnv()` |
| `libs/ui` | — (shared) | design tokens + the "Night Shift" component set |
| `libs/store` | — (shared) | `~/.ringtail` creds, `0600` — where pasted values land |
| `libs/sinks` | — (shared) | `writeEnvLocal` + `writeInfisical(env)` |
| `libs/recipes` | — (shared) | `Recipe` interface + the ~7 curated providers |
| `libs/core` | — (shared) | the acquire→validate→provision→sync state machine |
| `packages/cli` | third parties | `@ringtail/cli`, bin `ringtail` |

**Three laws:** no upward import · one public door (`src/index.ts` barrel) · by feature, not by
layer. See [`CLAUDE.md`](./CLAUDE.md) for the full agent guide and
[`docs/architecture.md`](./docs/architecture.md) for the contract.

---

## Verify the tree

```bash
bun run check             # typecheck + boundary lint, every project
bun run check:no-leak     # the guarantee — asserts no value ever leaves the daemon
cd libs/core && bun test  # the full offline lifecycle (acquire→validate→provision→sync)
```

---

Docs: **[docs.ringtailkeys.com](https://docs.ringtailkeys.com)** · Mascot art:
`apps/.brand-assets/rocco-*.png` · Brand source: `docs/brand/` (`_bible.md` is the root; soul /
voice / design-lock derive from it).
