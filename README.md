# Ringtail 🦝

**He raids the token pages so you don't.**

Ringtail is a **local, open-source, agent-orchestrated credential-provisioning tool**.
Your coding agent's little raccoon (Rocco) reads `.env.example` as the shopping list,
raids each provider's token page via their **official APIs** — never browser-bots —
scope-validates every key, and stashes it into `.env.local` **and** Infisical across
dev, staging, and prod. **One human "allow" per provider, then zero-touch forever.**

The anti-vault: instead of a cold enterprise locker you fill by hand, a competent little
bandit goes and gets the keys for you.

Canonical home: **[ringtailkeys.com](https://ringtailkeys.com)** · CLI: `ringtail` ·
npm scope: `@ringtail`

---

## 🔒 The agent never sees your secrets

This is the spine of the product, and it is an **enforced, verifiable invariant** — not a
promise. Your coding agent orchestrates the work; it never holds a value.

**The mechanism.** A pasted key flows **you → the daemon → `libs/store`**, and never
crosses the agent's MCP boundary. There is *no MCP tool that returns a secret value* — the
agent's entire surface is key **names** + statuses + the wizard/action content it authors.
When the daemon provisions, **it** makes the API calls with the stored creds and returns
*status, not values*. There is literally no code path from a stored secret to the agent.

- 🏠 **Local** — runs on your machine, keys stored in `~/.ringtail` (mode `0600`).
- 📖 **OSS** — this repo (`ringtailkeys/ringtail`) is public. Don't trust us — read it.
- 🚫 **Zero telemetry** — no analytics, no phone-home, ever. Trust is the product.

**Enforced, not asserted.** A leak-guard scans the whole MCP + SSE surface and fails the
build if any daemon→agent message ever carries a value:

```bash
bun run check:no-leak     # drives the full loop, asserts no value ever leaves the daemon
```

It runs in [CI](.github/workflows/ci.yml) on every push and PR — the guarantee can't
silently rot. Full threat model + how to audit it: **[SECURITY.md](./SECURITY.md)**.

> *"your keys. my paws only."* — Rocco

---

## Quickstart

```bash
# Use it (once published):
npx ringtail            # boots the daemon, opens the dashboard, picks your agent

# Hack on it (this repo):
bun install
./tilt_up.sh            # boots the daemon + dashboard via portless (never `tilt up`)
```

Verify the whole tree: `bun run check` (typecheck + boundary lint) · the guarantee:
`bun run check:no-leak` · the full offline lifecycle: `cd libs/core && bun test`.

## Structure — four buckets

The [builders-stack](https://github.com/ringtailkeys) "run vs ship" taxonomy, boundaries
enforced by Nx tags + `@nx/enforce-module-boundaries` (an illegal import is a lint error):

| Path | Served to | What |
| --- | --- | --- |
| `apps/dashboard` | humans | Vite+React local cockpit — a providers×envs connection grid |
| `services/daemon` | machines (a URL) | Hono; the MCP server (`/mcp`), SSE `/events`, paste sink |
| `libs/config` | — (shared) | env schema / `getEnv()` |
| `libs/ui` | — (shared) | design tokens + the "Night Shift" component set |
| `libs/store` | — (shared) | `~/.ringtail` creds, `0600` — where pasted values land |
| `libs/sinks` | — (shared) | `writeEnvLocal` + `writeInfisical(env)` |
| `libs/recipes` | — (shared) | `Recipe` interface + a worked example |
| `libs/core` | — (shared) | the acquire→validate→provision→sync state machine |
| `packages/cli` | third parties | `@ringtail/cli`, bin `ringtail` |

**Three laws:** no upward import · one public door (`src/index.ts` barrel) · by feature,
not by layer. See [`CLAUDE.md`](./CLAUDE.md) for the full agent guide and
[`docs/architecture.md`](./docs/architecture.md) for the contract.

---

Mascot art: `apps/.brand-assets/rocco-*.png`. Brand source: `docs/brand/` (`_bible.md`
is the root; soul / voice / design-lock derive from it).
