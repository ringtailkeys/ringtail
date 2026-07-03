# Ringtail — Brand Voice

**Status:** Locked v1. How Ringtail *sounds* — the enforceable rules for every
word we ship (landing, README, docs, blog, Discord, CLI output, errors, emails, social).
Companion to [`brand-soul.md`](./brand-soul.md) (who we are) and
[`design-lock.md`](./design-lock.md) (how we look). Soul wins ties.

---

## Voice in three words

**Scrappy · Deadpan · Trustworthy.** (A very competent raccoon who already raided your
token pages last night, telling you it's handled — flat, unbothered, and correct.)

## We sound like / we don't

| We sound like | We don't sound like |
|---|---|
| Resend, Cal.com, Fly.io, Infisical docs — devs with taste | HashiCorp enterprise decks — "secrets lifecycle management platform" |
| A deadpan friend who did the boring chore for you | A compliance dashboard onboarding wizard |
| Honest about the mechanic, shows the `.env` diff | Hype, superlatives, "enterprise-grade AI security" |
| Confident and brief | Hedgy, corporate, over-qualified |
| A little smug (the mask, "he's just a little guy") | Zany, cutesy, mascot-baby-talk |
| Warm and nocturnal — one sacred green means "you're in" | Cold blue-grey vault chrome, fear-based security FUD |

## Tone by context

- **Landing hero:** clarity first, one wink. The H1 states the mechanic (the agent gets
  your keys); the *eyebrow* carries the bit (`HE RAIDS THE TOKEN PAGES SO YOU DON'T.`).
  Never bury the value under the raccoon.
- **Docs / README:** plainspoken and complete. Show the command, name the gotcha (scopes,
  per-env drift, the one-time `allow`). Respect the reader — they're capable.
- **CLI output:** deadpan status lines in mono. `stripe → scope validated ✓` in green,
  `sendgrid → wrong scope, skipped` in grey. The tool narrates the raid dryly, never chatty.
- **Blog:** builder-to-builder. Opinionated, specific, honest. Teach the real mechanic —
  official APIs, not browser-bots; local + Infisical, not a rented vault.
- **Errors / empty states:** warm and human. "No keys stashed yet — point Rocco at your
  `.env.example`," not "Error 500."
- **Discord / social:** most playful. Rocco runs free here, stickers and all.
- **Comparison pages:** scrupulously fair. Respect Vault, Doppler, Infisical, 1Password;
  win on facts (it *acquires* keys, it's local + open source, one allow then zero-touch),
  never on snark.

## Rules of thumb (enforceable)

1. **Clarity beats cleverness — always.** If a reader has to decode the raccoon bit to get
   the value, cut the bit. Play lives in *chrome* (eyebrows, empty states, CTAs, Rocco's
   asides), not in the sentence that has to land the mechanic.
2. **Say the specific true thing.** "Reads `.env.example`, acquires every key, writes to
   `.env.local` + Infisical across dev/staging/prod" beats "effortless secrets automation."
3. **Active voice, short sentences.** Cut "very / really / just / actually / simply."
4. **Name the villain honestly, never childishly.** The wall of token pages, wrong scopes,
   and per-env drift are fair game; trashing HashiCorp as a company is not.
5. **Never puppet a login.** We say it plainly: the agent drives official provider APIs;
   the human clicks "allow" once. No browser-bots. That honesty *is* the trust.
6. **Green means one thing.** In copy and UI, sacred green = "scope validated / key works /
   synced." Never use green as decoration or a generic success flourish.
7. **No manufactured tagline closers.** Don't end every section with a punchy fragment —
   that reads as AI. End when the point's made.
8. **No staccato-for-effect.** "Local. Open. Yours." three-word fragment chains are banned;
   write real sentences.

## Vocabulary

**Use:** local, open source, own your keys, acquire, validate the scope, provision, sync,
`.env.example`, `.env.local`, Infisical, per-env (dev/staging/prod), one allow, zero-touch,
official APIs, the agent, the raid, the stash, keyring, no browser-bots.

**Ban:** revolutionary, game-changing, 10x, unlock, leverage (as verb), streamline,
seamless, cutting-edge, "enterprise-grade," "military-grade encryption," "secrets lifecycle
management," "single pane of glass," synergy, robust, frictionless, "book a demo,"
"reach out," "AI-powered" as the lead hook, fear-based security FUD ("hackers are coming").

## Signature moves

- **The bandit wink** — the mask, the ringed tail = keyring, "he raids so you don't,"
  "the only thief you'd trust" — as seasoning, never the meal.
- **The honest mechanic line** — "reads the manifest, drives the real API, writes two
  places, per env." Verbs and file paths, not adjectives.
- **Show, don't tell** — a real `.env` diff or a GIF of the raid (token page → green
  validated key → stashed) beats a paragraph of claims.
- **Inversion framing** — "a vault makes you fill it by hand; Rocco goes and gets the keys."
- **One sacred green** — the single moment of green in a warm-amber world carries all the
  "it worked" weight. Spend it once, mean it.

## Before → after

- ❌ "Ringtail is an enterprise-grade AI-powered secrets management platform."
  ✅ "Ringtail's raccoon reads your `.env.example`, grabs every API key, and stashes it in
  `.env.local` and Infisical — one allow per provider, then zero-touch."
- ❌ "Get Started" ✅ "Point Rocco at your repo" / "Star on GitHub"
- ❌ "Our seamless solution streamlines your credential lifecycle."
  ✅ "Fifteen token pages, wrong scopes, per-env drift — Rocco does all of it while you sleep."
- ❌ "Success!" ✅ "`stripe → scope validated ✓`" (in green — because it actually is)
- ❌ "Something went wrong 😢" ✅ "`sendgrid → wrong scope, skipped.` Rocco flicked the dud."

## Rocco's voice — the mascot register

Rocco (the ringtail bandit) is the brand's comedian and night-shift operator — deadpan,
lowercase, quietly smug. When Rocco speaks (speech-bubble asides, CLI flavor, captions,
empty/error states, Discord), the register shifts from "confident founder" to "unbothered
raccoon who already handled it last night":

- **Deadpan competence** — "raided your token pages at 2am. you were asleep. you're welcome."
- **Lowercase, dry, casual** — Rocco shrugs, never hypes. "one click. then i take it from here."
- **Tight** — one or two lines, max. A flat quip, not a paragraph.
- **In on the joke** — he's a trash-panda with a bandit mask running your key security.
  The inversion *is* the bit: the thief is your bodyguard.
- **A little smug, never creepy or cutesy** — "he's just a little guy" energy. Confident,
  not baby-talk, not menacing.
- **Never mean** — ribs the vaults lightly ("nice safe. you still gotta fill it yourself"),
  never nasty.

Rocco lines (adapt, don't overuse):

- **nav:** "hey. i'm rocco. i raid the token pages so you don't."
- **empty state:** "no keys stashed yet. point me at your `.env.example` and go to bed."
- **success aside:** "held it to the moonlight. glows green. that one's good."
- **error:** "wrong scope. dead key. flicked it. try the allow again?"
- **loading / raid in progress:** "head's in the dumpster. back in a sec with your keys."
- **provisioning:** "dealing these out — dev, staging, prod. everybody gets a pocket."
- **synced / idle:** "all stashed and synced. i'll nap on the hoard. wake me on the next key."
- **footer:** "goodnight. keys are handled. — rocco 🦝"

## Humor doctrine — funny without tanking the point

The bit IS the brand — and clarity/searchability still win. The rule:

- **Jokes live in the chrome** (eyebrows, asides, captions, empty/error states, CTAs, section
  breaks, CLI flavor lines). The load-bearing sentence — the one carrying the mechanic or the
  SEO answer — stays clean.
- **On the blog:** Rocco + the raid metaphor go in intros, asides, image captions, pull-quotes.
  The body stays **answer-first, factual, scannable** — GEO/AI-citation depends on it. A post
  can be funny in framing and still lead each section with the direct answer.
- **Funny, not cutesy.** Dry and specific beats zany and generic. Rocco is deadpan, not a
  cartoon sidekick. Read it aloud; if you wouldn't say it to a friend, cut it.
- **Bold ≠ loud everywhere.** The humor lands *because* the mechanic is solid and the security
  story is honest (official APIs, local, one allow). Earn it.

*Provenance: `_bible.md` (Ringtail brand bible) + the krispyai brand-voice discipline
(clarity > cleverness, no staccato, no manufactured closers, ban weak CTAs/filler).
Update as we ship more copy.*
