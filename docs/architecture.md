# Ringtail — Architecture & Agent↔UI Contract (P0, the pin)

**Status:** founding spec. This freezes the decisions the design converged on. Build against this.

## North star
You run one command, pick your coding agent, and **it drives everything** — discover → acquire → validate → provision → sync your keys, then surface repo-specific next actions — while you watch progress and make only the calls a human must (consent clicks, approve an action). The tool is **local, OSS, zero-telemetry**; the agent never sees a secret value.

## The core principle — generative UI over MCP
**The agent supplies structured content through MCP; Ringtail owns every pixel.**
- The MCP schema is a **UI-component vocabulary** (`Wizard`, `Step`, `Action`, `Status`). The agent fills typed slots — it never emits HTML/markdown/CSS.
- Each type maps 1:1 to a component in the `libs/ui` "Night Shift" design system → agent output is **on-brand by construction**.
- Schema-validated data → **safe** (no injection) *and* **beautiful** (no ugly freeform output). Constrained vocabulary is the moat for both quality and security.
- Agent = director (*what*); Ringtail = stage + actors (*pixels*).

This is why the design system was built first: it's the render target.

## THE GUARANTEE — "the agent never sees your secrets" (enforced, not promised)
The #1 trust claim and the product's spine. It is an **enforced, verifiable invariant** — not marketing copy:
- **Architecture makes it impossible.** There is NO MCP tool that returns a secret value. The agent's entire surface = key *names* + status + wizard/action content. `paste` values flow **user → daemon → validate → `libs/store`** and never cross the MCP boundary. There is literally no code path from a stored secret to the agent.
- **Tested + CI-gated.** A leak-guard (`check:no-leak`) statically scans the MCP surface + asserts at runtime that no tool response carries a value + an e2e assertion — wired into CI as a **build gate**. Violating the invariant **fails the build**, exactly like the boundary lint. The promise can't silently rot.
- **Auditable.** It's OSS — don't trust us, read the ~200 lines and run the test.
- **Surfaced everywhere** (per the founder's direction): landing hero + a dedicated trust section (diagram: *value → Ringtail, local; agent → names only*); `README.md` + `SECURITY.md` up top; and a **persistent UI affordance** — every `paste` step shows "🔒 goes to Ringtail, not the agent," a header trust indicator, and Rocco's line ("your keys. my paws only.").

We stand behind it by making it *structurally true and provable*, not by asking to be believed.

## The four layers (the whole product, in order)
1. **Get the root keys** — the ONLY place a human is needed. The Wizard (`open-url`/`paste`/`confirm`) + local discovery + the recipe fast-path. **Goal: shrink this to almost nothing** — one consent per provider, EVER, reused across every repo *and* every downstream automation.
2. **Map the actions** — `mapActions` → the repo-specific + cross-tool actions now possible: a Neon branch per env, wire Infisical → CF Pages, set a Workers binding, point the domain, create the R2 bucket your code already references. Agent maps; the actions panel renders.
3. **Automatically make it happen — THE POINT.** With the root grant, everything downstream is `auto`: the agent orchestrates a chain of API calls and the work *just happens*, no human. Layers 1–2 exist only to make layer 3 possible. **Do not forget this is the point** — Ringtail is not a form you fill, it's an agent that does the work while you watch.
4. **Recovery — never a dead end.** A wrong/expired key, an insufficient scope, or a failed action (API error, rate-limit, conflict) is a **first-class state**, not an exception. Ringtail catches it, explains it in plain language, and routes to the fix: re-paste/re-consent for a bad key; the *exact* missing scope + a deep-link (or the one box to tick) for insufficient scope; retry / alternative / an agent-authored manual fallback for a failed action. The agent **re-plans on failure** — it authors a recovery wizard/action from the error + Context7. Maps to the already-built `wrong-scope` / `failed` StatusChip states + Rocco's error pose. Every failure surfaces a cause *and* a next step.

### Orchestrate vs execute (how layer 3 keeps THE GUARANTEE)
The **agent orchestrates** (`executeStep` / `executeAction`); the **daemon executes** with the stored root creds. The agent is the conductor — it never holds a secret; the daemon holds the creds, makes the API calls, and returns *status, not values*. Automation and "the agent never sees your secrets" coexist precisely because the agent *triggers* and the daemon *does*.

### The automation bias
**Default = auto-run. Confirm is the exception, only for destructive.** Safe actions (create a DB branch, set an env var, wire a binding, create a bucket) just happen — making the user approve every safe step kills the magic. Only irreversible ones (domain transfer, NS swap, delete) hard-confirm. The dashboard should feel like *watching the agent work* — cells flipping green, steps checking off, resources appearing.

## The dashboard is a conversation, not just a board
The dashboard has a **chat panel** — you talk to the same agent that's driving everything, right there in the UI. The agent both **converses** (chat) and **renders** (grid, wizards, actions) over the same MCP connection: chat is the *direction* channel, the components are the *state* channel, one agent behind both.
- **Directable actions.** The layer-2 action list is *living*, not fixed. "also set up Stripe" · "skip the R2 bucket" · "add a staging env" → the agent adds / removes / adjusts actions to match what you're trying to achieve, and re-renders the panel. You steer; it re-maps.
- **Talk it through.** "why does this need that scope?" · "what breaks if I skip Infisical?" — the agent answers in the chat, grounded in your repo + Context7, without leaving the dashboard.
- **Same guarantee.** Chat is about *intent and actions*, never secret values — paste-bypasses-the-agent still holds.

Generative-UI **+ chat**: an operator you converse with that also paints a live cockpit. Renders via `renderWizard`/`renderActions`/`updateStatus`; the daemon relays the agent↔user chat to the panel.

## The daemon (always-on local host)
A Hono daemon is the single local host. It:
- serves the **dashboard** UI, and
- is the **MCP server**, over **Streamable HTTP** (`http://127.0.0.1:<port>/mcp`) — NOT stdio, because the dashboard and the agent must share ONE live state (connection map, consent callbacks). stdio would spawn a separate per-session server with its own state.
- **Security (non-negotiable for a creds tool):** bind `127.0.0.1` only; mint a **session token** on `ringtail up`, required on every MCP call + shared with the dashboard and the registered agent; Origin/CSRF checks. A stdio→HTTP shim (`ringtail mcp-stdio`) bridges stdio-only clients without forking state.

## Entry & agent selection (OpenDesign pattern)
- **Dashboard-first:** `ringtail up` (from a clone: `bun packages/cli/src/index.ts up`) → boots the daemon → opens the dashboard → **auto-detects agent CLIs on PATH** (claude · codex · cursor · gemini) → you pick one (or "guided/manual") → Ringtail registers + spawns it with the task + the MCP URL+token → it drives; the dashboard streams progress and surfaces consent.
- **Agent-first:** already in Claude Code → `claude mcp add ringtail --transport http http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"` → "set up my keys." Dashboard opens as the visual surface.

## The env axis
`local · dev · staging · prod`.
- **local** = your machine, `.env.local`, localhost — the only env that touches your disk.
- **dev · staging · prod** = deployed; secrets → **Infisical only**, never your disk. Each gets its own scoped keys/resources (e.g. a Neon branch per env).
- Sink routing: `local → .env.local`; `dev/staging/prod → Infisical`.

## The unified contract (one schema for setup AND actions)
"Set up an unknown key" and "do this next action" are the **same structured thing**, rendered by one universal 1-2-3 wizard.

```ts
type StepKind = 'open-url' | 'paste' | 'auto' | 'confirm';
interface Step { id: string; title: string; description: string; kind: StepKind;
                 payload?: { url?: string; varName?: string; scopes?: string[] };
                 danger?: 'safe' | 'confirm' | 'destructive';
                 status: 'pending' | 'active' | 'done' | 'failed'; }
interface Wizard { id: string; title: string; provider?: string; steps: Step[]; }
interface Action { id: string; title: string; why: string; prerequisites: string[];
                   danger: 'safe' | 'confirm' | 'destructive'; wizard: Wizard; }
```

**Step kinds — and the trust linchpin:**
- `open-url` — Ringtail opens the deep-link (must be an https provider URL; allowlist-validated, not arbitrary).
- `paste` — **the value flows user → Ringtail, NEVER through the agent.** The agent authors the step ("paste your Resend key, needs `sending` scope"); Ringtail collects + validates (validate-after-paste) + stores. This is what keeps "the agent never sees your secrets" true even for agent-generated wizards.
- `auto` — a typed executor / API call, no human.
- `confirm` — human approval; `destructive` (domain transfer, NS swap, delete) hard-gated, never one-click.

The agent **checks off each step as it completes** (streamed) → the wizard advances live.

## MCP tools (the surface)
- `plan(context) → Status[]` — scan `.env.example` + connected state → the grid (providers × `local/dev/staging/prod`, 7 states). Emits key **names**, never values.
- `authorWizard(context) → Wizard` — agent maps repo + connected state → a setup wizard for a provider we don't have a recipe for (or any custom flow).
- `mapActions(context) → Action[]` — agent maps repo-specific next steps (domain→CF, Infisical→CF bindings, Neon branch per env, R2 bucket…).
- `renderWizard(wizard)` / `renderActions(actions)` — push validated content to the dashboard.
- `updateStatus(provider, env, status)` — flip a grid cell.
- `submitStep(stepId, ...)` + callbacks — human completes a `paste`/`confirm` → daemon notifies the agent (the Loop callback).

## Recipes vs agent-authored wizards
- **Recipes** (`libs/recipes`, the ~7 curated: cloudflare/neon/better-auth/resend/posthog/infisical/creem) = the **fast-path** — tested, one-click, deterministic.
- **Agent-authored wizards** = the **universal fallback** for the infinite long tail (any provider, any action), via `authorWizard` + Context7 live docs.
- Net: **we don't need many recipes to be useful** — the agent covers everything. Recipes are an optimization, not a requirement. Kills the maintenance tax.

## Local credential discovery
Before asking, scan **known** credential stores (`.env.local`, `~/.ringtail`, `~/.aws/credentials`, `~/.config/gh`, `~/.wrangler`/`~/.cloudflared`, env) → validate → reuse → only prompt for real gaps. Read *known* locations only, local-only, transparent about what was reused. Never scan the whole disk.

## Guardrails (the trust product)
1. Every agent-produced payload is **schema-validated**; malformed → rejected. No freeform HTML/markdown as UI.
2. `paste` values go **user → tool, never through the agent**. The agent never sees secret values (works with key *names* + connections + repo).
3. `open-url` URLs allowlist-validated (https provider domains).
4. `auto` = typed executors, not arbitrary shell. Novel agent steps get extra human review.
5. `destructive` steps hard-confirm.
6. **Zero telemetry.** No analytics, no phone-home, ever.

## Roadmap
- **P0 — DONE.** This doc; the pin the build is verified against.
- **P1 — DONE.** `local` column + env-axis sink routing (`local → .env.local`, `dev/staging/prod → Infisical`) in `libs/sinks`; `syncCredential` fans one key out per env. Covered by `libs/core` e2e (real `.env.local`, per-env Infisical, byte-identical idempotent re-run).
- **P2 ⭐ — DONE.** The agent-drives-it spine against the mock: daemon MCP-over-HTTP + session token (`services/daemon`, `@modelcontextprotocol/sdk`), the tool surface (`plan`/`renderWizard`/`updateStatus`/`submitStep`/`executeStep`/`executeAction`), the universal wizard renderer + check-off streaming (SSE `/events` + live `DaemonStore`), agent picker, dashboard wired live. `bun run demo` drives the full loop to **synced** with zero real cloud.
- **P3 — DONE (code; live-run pending).** Cloudflare recipe is real (deep-link consent + validate-**after**-mint that catches wrong-scope and refuses to provision/sync). The one honest gap: **a real Cloudflare live run needs a real CF account** — the mint→validate path is exercised against the mock provider, not yet a live token. That's a human step, not a code gap.
- **P4 — DONE.** Actions panel + first executor: `mapActions` → validated `Action[]`, `domain→CF` typed executor with a **hard-confirm** gate (destructive, never one-click). `bun run demo` proves map → approve → confirm → execute (mock).
- **P5 — DONE.** Local credential discovery (`~/.ringtail`/`.env.local`/known stores, names + source only, reuse complete root grants) + `authorWizard` universal fallback for the long tail. Krispyai's fuller stack still onboards recipe-by-recipe.
- **THE GUARANTEE — DONE + CI-gated.** No MCP tool returns a value; `paste` flows user → daemon → `libs/store`, never into the snapshot/SSE/any response (`submit.ts`). Enforced by `check:no-leak` (static + runtime + e2e) as a build gate. Zero telemetry SDK in the tree (verified by grep).
- **Recovery (Layer 4) — DONE.** Wrong-scope / failed-action are first-class rendered states (`wrong-scope`/`failed` chips); the agent re-plans into a recovery wizard. Proven end-to-end in `bun run demo` (wrong-scope → recovery → synced) and `libs/core` tests.
- **Chat — DONE.** Dashboard chat panel over the same MCP connection (agent converses + renders). Agent→user via `sendChat`; user→agent is **event-driven, no polling** — a typed message rides back as `pendingUserMessages` piggybacked on the agent's next `plan`/`executeStep`/`updateStatus`/`authorWizard` call (intent-only, never a value; `state.ts`). A `paste` to `submitStep` auto-advances the next safe auto step in the daemon. `bun run demo:chat` exercises it.

## Fits the ecosystem
- Ships as a **Delulus "Provision your stack" Move** (Navigator triggers it via MCP; consent = a Loop human-handoff; status back, never values).
- Monetization: OSS + audience is the near-term ROI; the one clean paid seam is **self-hosted enterprise governance** (audit · scope-policy · RBAC/SSO). Never become a key-holding cloud broker; never add telemetry.
