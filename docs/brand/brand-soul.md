# Ringtail — Brand Soul

**Status:** Draft v1 (founding). This is the canonical doctrine for what Ringtail *is*,
who it's for, and how it speaks — across the landing page, the docs, the CLI's default
output, the README, and any future surface. Companion doc: `design-lock.md` (the visual
system) and `brand-voice.md` (the writing rules). This doc is the *soul* (positioning +
voice); those are the *skin* and the *mouth*.

---

## One-liner

> **He raids the token pages so you don't.**
> Ringtail is a local, open-source keyring bandit. Your coding agent reads your
> `.env.example` as a shopping list, raids every provider's token pages through their
> *official* APIs, validates the scopes, and stashes each key into `.env.local` **and**
> Infisical across dev, staging, and prod. One human "allow" per provider, then
> zero-touch forever.

Meet **Rocco** — the deadpan little trash-panda who already did it last night while you
slept. The only thief you'd trust with every key you own.

---

## The name

**Ringtail** is a real animal — a raccoon-cousin whose ringed tail *is* the pun. That
tail is your keyring: a loop of brass loaded with mismatched keys. The whole product
lives inside the name, so you never have to explain the metaphor twice.

The bandit mask reads "thief" on purpose — and then inverts it. Every other tool in this
category is a **vault**: a cold box you fill by hand and guard behind a login. Ringtail
is the opposite job. It's the one bandit who breaks *into* the token pages *for* you and
brings the loot home. The mask isn't a warning; it's the wink. The thief is your
bodyguard.

The theme is **Night Shift** — a warm, nocturnal "cozy-dumpster-at-2am" world where a
scrappy raccoon works the graveyard shift while you sleep: raiding provider dashboards,
washing the loot, and stacking your keys into neat stash-pockets. It's the anti-vault and
the anti-orb at once — run by one very competent raccoon, not a slate-grey enterprise
secrets locker.

*(Naming note: `Vault`, `Bandit`, and `Stash` are all taken in the dev space; a
raccoon-cousin whose tail = keyring is genuinely ownable. `ringtailkeys.com` /
`getringtail.com` are the realistic homes. Confidence high on differentiation and
virality; moderate on exact `.com` availability.)*

---

## The problem we solve

Every new project starts with the same soul-crushing wall:

- **15 token pages**, each with its own login, its own "create new API key" button buried
  three clicks deep, its own scope checkboxes you'll get wrong the first time.
- **Wrong scopes** you don't discover until the call 401s at runtime — so you go back,
  regenerate, re-paste.
- **Per-environment drift** — the key that works locally isn't in staging, the prod one
  is stale, and nobody remembers which `.env` is the source of truth.
- **Then a vault** (Vault, Doppler, EnvKey, 1Password) that makes you do *all of that by
  hand* and only stores the result behind yet another login.

The category's tools solve **storage**. Nobody solved **acquisition** — the actual pain.
You still do the boring, error-prone chore; the vault just holds the output.

Ringtail is the third option: **a bandit that goes and gets the keys for you.** Your
coding agent reads `.env.example` as the manifest, drives each provider's official API to
mint and scope the key, validates it on the spot, and writes it to `.env.local` *and*
Infisical for every environment. You click "allow" once per provider. After that, it's
zero-touch — Rocco works the night shift so you can build.

---

## What Ringtail IS

- **Local & open-source first.** It runs on your machine, in your repo. The whole thing
  is public — read it, fork it, self-host it. Trust is earned by being inspectable, not
  by a compliance badge. Your secrets never sit behind *our* login, because there is no
  "our."
- **Agent-orchestrated.** Ringtail is your coding agent's little raccoon. Claude Code or
  Codex is the hands; Rocco is the scheme. The agent does the boring setup chore end to
  end so you never open a token page again.
- **Official-APIs-only.** The agent drives each provider's *real* API to mint, scope, and
  rotate keys. It never puppets a login screen, never scrapes a dashboard, never asks for
  your password. You click "allow"; the API does the rest.
- **One-consent-then-zero-touch.** One human "allow" per provider — a single deliberate
  yes — and then it's autopilot forever. New env? New key? Rocco already handled it.
- **Scope-validated.** Every key gets washed before it's trusted: the agent validates the
  scope on the spot. A key that works glows sacred **Scope Green**. A dud gets flicked
  away.
- **Multi-environment by design.** Keys land in `.env.local` **and** Infisical, dealt
  into the right stash-pocket for dev, staging, and prod. No per-env drift, no "which
  `.env` is real."
- **Sticker-native.** Rocco is a Discord emoji, a Telegram sticker, a die-cut vinyl, a
  hoodie print. The mascot *is* the distribution.

## What Ringtail is NOT

- **Not a cold enterprise secrets vault.** No blue-grey compliance dashboard, no "secrets
  management platform" register, no SSO-gated console. If it feels like HashiCorp Vault's
  landing page, it's wrong.
- **Not a breathing "AI orb."** No gradient blob, no glowing sphere, no faceless "assistant
  presence." Ringtail has a *face* and a *scheme*. A character with a mask is the hard
  anti-orb.
- **Not a browser-bot.** Ringtail never puppets your login pages, never automates a
  headless Chrome through a provider's dashboard. Official APIs only. If it needs your
  password to type it into a form, it's not us.
- **Not a rented SaaS.** We don't store your secrets behind someone else's login and
  charge you monthly to reach them. The keys live in *your* `.env.local` and *your*
  Infisical. There's no middle for us to sit in.
- **Not cutesy, not creepy.** Rocco is deadpan and competent. He doesn't do big-eyed
  cute, and he doesn't do surveillance-menace. He's just a little guy who's very good at
  his job.
- **Not decoration-happy with the green.** Sacred green means exactly one thing:
  *validated / it worked / synced*. It is never a background, never a highlight, never a
  vibe.

---

## Audience (2026)

Primary, in priority order:
1. **Indie devs & solo founders** who spin up a new project every few weekends and hit
   the token-page wall every single time. They want to build, not administer.
2. **Vibe-coders** living inside their coding agent — the "describe it and it ships"
   crowd. They already delegate the code; delegating the *setup chores* is the obvious
   next step. Ringtail is the piece of the agent stack nobody built yet.
3. **Agent users on teams** who need the same keys, correctly scoped, across dev /
   staging / prod without a Slack thread asking "who has the Stripe test key?" Infisical
   sync makes Rocco the shared bandit.

Aspirational tier (we should be *worthy* of them, not yet optimized for): small teams who
graduate from "founder pastes every key by hand" to "the agent provisions the whole
environment on `git clone`."

We are **not** optimizing for: enterprise security orgs buying a compliance platform,
audit-first secrets governance, or anyone whose goal is a locked box rather than a filled
one.

---

## Positioning — the one axis

> **A bandit that GETS your keys, warm and mascot-led — not a vault you FILL, cold and
> faceless.**

Ringtail rebels on two axes at once, and every judgment call bends along both:

1. **Get, don't store.** Away from *a box you fill by hand*, toward *a little bandit who
   goes and gets it.* When unsure whether a feature is on-brand, ask: does this do the
   boring chore *for* the user, or just hold the result?
2. **Warm, not cold.** Away from *slate-grey enterprise secrets speak*, toward *moonlit
   cream, loot amber, one sacred green, and a raccoon with a face.* When unsure about a
   pixel or a sentence, ask: does this feel like Rocco, or like a compliance vendor?

**Reference axis:**
- **Closer to:** the warmth and taste of Resend, Cal.com, Supabase — dev tools with a
  human voice — plus the sticker-native, mascot-led swagger of a GenZ open-source project
  people actually put on a laptop.
- **Farther from:** HashiCorp Vault, Doppler, EnvKey, 1Password, CyberArk — the register
  of enterprise secrets management. Also farther from every gradient-blob "AI agent"
  landing page.

---

## Tone of voice

### The three words: **Scrappy · Deadpan · Trustworthy**

- **Scrappy** — this is a raccoon in a dumpster, not a product manager in a webinar.
  Warm, GenZ, a little chaotic-good. It brags the way a competent friend brags: dry, not
  loud.
- **Deadpan** — the humor is in the flat delivery, never the exclamation point. Rocco
  states what he did like it was nothing. "Raided Stripe. Scoped it. It's in your
  `.env.local`. Go back to sleep."
- **Trustworthy** — under the mask, the substance is real: official APIs, local, open
  source, scope-validated. We can be funny *because* the security story is airtight. The
  wink only works if the lock is real.

### Register

- **Warm-but-bold.** Cream and amber, not slate and blue. Bold Clash Display headlines
  with a raccoon energy, not a corporate serif.
- **Builder-to-builder.** Assume the reader ships. Show the `.env.example`, name the
  scope, respect their time.
- **Honest over hype.** AI is plumbing; the raid is the point. No "revolutionary
  secrets orchestration platform." Just: he gets your keys.

### Do / Don't

| | Do | Don't |
|---|---|---|
| **Headline** | "He raids the token pages so you don't." | "Revolutionize secrets management with AI 🚀" |
| **Subhead** | "Local, open-source. Your agent gets the keys, validates the scopes, syncs every env." | "The enterprise-grade platform for API credential lifecycle governance." |
| **CTA** | "Clone it" / "Point it at your `.env.example`" / "Watch him raid" | "Book a demo" / "Talk to sales" |
| **Feature** | "One 'allow' per provider. Then he never asks again." | "Streamlined consent workflows for credential provisioning at scale." |
| **Success** | "Scope validated. Key's in. ✅ (green)" | "Operation completed successfully." |
| **Error** | "Wrong scope. Flicked it. Grabbing a fresh one." | "Error: credential validation failed (code 0x1F)." |

### Anti-patterns

- "Revolutionary," "enterprise-grade," "secrets lifecycle," "unlock the power of."
- Emoji soup (Rocco is the brand mark; beyond a single sacred ✅, restraint).
- "Book a demo" energy. If an indie dev can't clone it and point it at a repo without
  talking to us, we've failed.
- Cutesy baby-talk *or* surveillance-menace. Rocco is deadpan, never either.
- Cold enterprise throat-clearing ("In today's threat landscape, credential sprawl…").
- Using green for anything but *it worked*.

---

## Values (the defaults these produce)

1. **Get, don't just store** — the product's reason to exist is doing the *acquisition*
   chore. Storage is table stakes; going and getting the keys is the whole point.
2. **Local & open by default** — it runs in the user's repo, the code is public,
   inspectable, forkable. Your secrets never live behind our login, because there is no
   "our" server in the path.
3. **Official APIs only** — never a browser-bot, never a scraped dashboard, never your
   password. One human "allow," then the provider's own API does the work.
4. **Validate before you trust** — every key gets its scope washed and checked on the
   spot. Green means it *actually* works, not that a request was sent.
5. **Zero-touch after one yes** — respect the human's attention. Consent once, deliberately,
   per provider; after that Rocco handles the drift, the rotation, the new env, silently.
6. **Sticker-native** — the mascot is the marketing. A face people want on their laptop
   beats a feature list nobody reads.

---

## Success criteria

A page / feature / line of copy is on-brand if a thoughtful indie dev would:
1. **Trust it** (because it's local, open source, and drives official APIs — they can
   read exactly what it does).
2. **Get it running** without talking to a human or hitting a paywall — point it at a
   `.env.example` and watch it work.
3. **Feel it was made by someone who ships**, not by a security vendor's marketing team.
4. **Smile once** at Rocco (the mask, the deadpan, the "he did it while you slept") without
   being annoyed.
5. **Never confuse it with HashiCorp Vault** — or with a gradient-blob AI orb.
6. **See green and know it's real** — the color only ever fires when a scope actually
   validated.

If a change fails any of these, it's off-brand — even if it "looks more professional" in
the short term.

---

## Provenance & change process

- Born from the universal indie-dev pain: the wall of token pages, wrong scopes, and 15
  env vars before you can build anything — and the realization that the whole secrets
  category solved *storage* while leaving *acquisition* a manual chore.
- The mascot **Rocco** and the **Night Shift** theme are the spine: a scrappy, deadpan,
  competent ringtail whose ringed tail is the keyring and whose bandit mask is the wink.
- **Voice + positioning changes** require a deliberate call (this is the spine).
- **Examples/phrasing** can be added freely as we ship more surfaces.
- Keep `design-lock.md` (palette: ink · night · cream · amber · acid · hot · sacred green
  · berry; fonts: Clash Display / Satoshi / JetBrains Mono) and `brand-voice.md` in sync
  as the visual and writing systems firm up.
