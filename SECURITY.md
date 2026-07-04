# Security

Ringtail is a credentials tool, so trust is the product. This document states the one
guarantee it lives or dies by, the threat model behind it, how the codebase *enforces* it,
and how you can audit it yourself in a few minutes.

## THE GUARANTEE — the agent never sees your secrets

Your coding agent orchestrates the whole flow (discover → acquire → validate → provision →
sync), but **it never sees a secret value.** This is not a policy we ask you to trust — it
is a structural invariant of the code, tested and CI-gated.

## Threat model

The agent (Claude, Codex, Cursor, Gemini, …) is a capable but **untrusted** party. It runs
your task, authors wizards, and triggers actions over MCP. We assume it could be
compromised, prompt-injected, or simply buggy. The guarantee must hold **even if the agent
turns hostile.** Concretely, we defend against:

- **Value exfiltration via MCP.** A tool that returns a secret value would hand it straight
  to the agent. → *No such tool exists.*
- **Value leakage via the state stream.** The dashboard's live SSE feed could echo a pasted
  value back where the agent can read it. → *The stream carries names + statuses only.*
- **The agent intercepting the paste.** If the paste flowed through the agent, it would see
  the value en route to storage. → *Paste bypasses the agent entirely.*
- **Injection through agent-authored UI.** Freeform HTML/markdown as UI would be an
  injection surface. → *Every payload is schema-validated (`Wizard`/`Step`/`Action`);
  malformed is rejected.*
- **Network egress / phone-home.** Analytics or telemetry could ship data off-box. →
  *Zero telemetry. The only network target is the local daemon and the real provider APIs.*

Out of scope: an attacker with local root on your machine (they can read `~/.ringtail`
directly — that's the OS's trust boundary, not the agent's), and the provider's own
handling of the key after mint.

## How the guarantee is enforced (the mechanism)

1. **No value-returning tool.** The MCP surface is `plan` / `authorWizard` / `mapActions`
   / `renderWizard` / `renderActions` / `updateStatus` / `submitStep` / `executeStep` /
   `executeAction`. Every one returns key **names**, statuses, or agent-authored content —
   **never a value.** The daemon holds the creds; the agent conducts.
2. **Paste bypasses the agent.** A `paste` value flows **you → daemon → `libs/store`**
   (`POST /api/step`, or `submitStep` collecting it locally). The agent authors the *step*
   ("paste your Cloudflare token, needs `edit` scope") but the value never crosses the MCP
   boundary. Provisioning runs daemon-side and returns *status, not values*.
3. **Enforced in code, gated in CI.** `check:no-leak` drives the full loop over MCP against
   the mock, captures **every** daemon→agent tool result **and** every SSE payload **and**
   the browser paste response, then asserts no sentinel value ever appears — while proving
   the loop really ran (the paste *held* its value, statuses flipped to `synced`). A leak
   **fails the build**, exactly like the boundary lint. See
   [`services/daemon/src/no-leak.test.ts`](./services/daemon/src/no-leak.test.ts).

## Audit it yourself

It's OSS — don't trust us, read it. The whole guarantee is a small surface:

```bash
# 1. Read the enforcement (~200 lines): the MCP tools + the leak-guard test.
$EDITOR services/daemon/src/index.ts services/daemon/src/no-leak.test.ts

# 2. Run the guard. It fails loudly if any value ever reaches the agent.
bun run check:no-leak

# 3. Run the full offline lifecycle (acquire→validate→provision→sync, no cloud).
cd libs/core && bun test
```

If you can find a code path from a stored secret to an agent-visible message, that's a
critical bug — please report it (below).

## Reporting a vulnerability

Please **do not** open a public issue for a security report. Email the maintainers via the
contact on **[ringtailkeys.com](https://ringtailkeys.com)** with steps to reproduce. We aim
to acknowledge within 72 hours. Because the leak-guard is the product's spine, a confirmed
break of THE GUARANTEE is treated as top severity.
