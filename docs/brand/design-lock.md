# Ringtail — Design Lock

**Status:** Draft v1 (founding). The canonical *visual* system for Ringtail — tokens,
type, motion, components, and the "we don't do this" list. Companion to
[`brand-soul.md`](./brand-soul.md) (voice/positioning) and [`_bible.md`](./_bible.md)
(the source palette + mascot spec). This doc is the *skin*; those are the *soul*. When
they conflict, soul wins.

**System name:** *Night Shift* — a warm, nocturnal "cozy-dumpster-at-2am" world where a
scrappy trash-panda works the graveyard shift while you sleep: raiding provider
dashboards, washing the loot, and stacking your keys into neat stash-pockets. The whole
system lives on one axis (straight from the bible): **warm & scrappy, not cold &
enterprise.** Warmth comes from moonlit cream, loot amber, and a brown-black nocturne;
crispness from plum-black ink, tight mono, and one sacred green that means *it worked*.
If a screen feels like HashiCorp Vault or a blue-grey secrets dashboard, it's wrong. If
it feels like a good dev tool run by one very competent raccoon, it's right.

---

## 1. Principles (win over any single token)

1. **Warm & nocturnal, not corporate.** Moonlit cream over cold white; a brown-black
   night ground, deliberately NOT blue-black. Every default bends away from the vault.
2. **Scrappy, not sloppy.** The 2am-dumpster energy is a vibe, not an excuse — high
   contrast plum-ink, sharp mono, confident type. Rocco is competent.
3. **The agent does the boring part; show it.** Ringtail is a dev tool. The
   `.env.example` manifest, the CLI output, the "scope validated" line — these are hero
   elements, set in mono, not buried in docs.
4. **Deadpan in the details, serious in the substance.** The bandit mask, the "he
   already raided your token pages" wink, a smug tail-flick on hover — earned by
   rock-solid, legible layout.
5. **Effortless motion.** Nothing feels laborious. Smooth, quick, a hint of spring — the
   glint on a key catching moonlight. Never stiff, never slow.
6. **Restraint on color.** Amber does the work. The sacred green appears ONLY where a
   scope genuinely validated / a key genuinely synced. Everything else is ink on cream.

---

## 2. Color tokens (locked)

Two themes: **Moonlit** (light, default) and **Graveyard** (dark). Use CSS vars, never
raw hex. Derived directly from the bible palette.

### Moonlit (light — default)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F6EDDD` | Warm moonlit-paper page background. Never white, never blue-grey. |
| `--surface` | `#FCF6EC` | Cards / raised surfaces (warmer paper). |
| `--ink` | `#211A1E` | Primary text + the mask + the single-weight sticker outline. Warm plum-black, never cold black. |
| `--ink-soft` | `#6E5E52` | Secondary text, muted taupe-cocoa. |
| `--amber` | `#F5A524` | **Ringtail amber** — the primary brand + CTA color. The glint on a stolen key. Baked, not neon. |
| `--amber-deep` | `#D6851A` | CTA hover / pressed / depth — the darker side of amber, edges on buttons. |
| `--grey` | `#AA9D8C` | Warm taupe neutral — fur, surfaces, hairlines, muted UI, dud/expired keys. Never cool slate. |
| `--acid` | `#E8FF4B` | **Acid highlight** — the flash when a key catches moonlight. Loud but sparse: hero pops, social-card fills, glints. |
| `--hot` | `#FF5C8A` | Hot accent — links, active states, energy chrome, Rocco's cheek-blush. The gen-z jolt. |
| `--green` | `#37B27E` | **SACRED signal** — ONLY "scope validated / key works / synced." Never decoration. |
| `--berry` | `#8A3A63` | Secondary accent + nocturnal depth — the night behind the dumpster, section breaks. |
| `--line` | `#E4D8C4` | Warm hairline borders. |
| `--danger` | `#C0432E` | Errors (warm brick, never fire-truck red). Sits next to the "wrong-scope dud key" motif. |

### Graveyard (dark)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#17110F` | Deep brown-black nocturne. The anti-SaaS ground — deliberately NOT blue-black. |
| `--surface` | `#211A1E` | Raised surface (warm plum-black). |
| `--ink` | `#F6EDDD` | Cream text. |
| `--ink-soft` | `#AA9D8C` | Muted warm taupe. |
| `--amber` | `#F5A524` | Amber holds up on dark; nudge to `#F7B23E` if a block needs more pop. |
| `--amber-deep` | `#D6851A` | Hover / pressed. |
| `--acid` | `#E8FF4B` | Moonlight flash — even louder on the night ground, still sparse. |
| `--hot` | `#FF5C8A` | Links, active, blush. |
| `--green` | `#37B27E` | Sacred synced-green (brighten to `#45C88E` on dark if contrast needs it). |
| `--berry` | `#8A3A63` | Depth / section breaks / the dumpster-alley sky. |
| `--line` | `#33262A` | Hairline. |

### Banned color
- **No cold blue-grey enterprise palette.** No `#F3F4F6`, no Vault/Doppler slate, no
  Infisical blue. The night ground is brown-black, never blue-black.
- **No neon glow.** Amber is baked; acid is a *flash*, not a light source. Nothing pulses.
- **Green is sacred** — it means "scope validated / key works / synced," full stop.
  Don't spend it on decoration; it's the one signal color.
- Acid and hot are *spice* — a whole page of acid is a headache, not a brand.

---

## 3. Typography (locked)

Three families, one role each. Loaded via `next/font` (or self-hosted woff2).

| Var | Family | Role |
|---|---|---|
| `--font-display` | **Clash Display** (Bold/Semibold) | Big chunky headlines, wordmark, hero moments. Characterful and gen-z-ownable — the swagger in Night Shift. |
| `--font-ui` | **Satoshi** (Inter fallback) | All UI + body. Warm geometric sans, friendly not corporate. |
| `--font-mono` | **JetBrains Mono** | Keys, `.env` snippets, CLI output, deadpan status lines, technical labels, eyebrows. Mono *is* part of the brand — it's where the loot lives. |

**The axis in type:** chunky warm **Clash Display** ↔ tight **JetBrains Mono** status
lines. That contrast (bold character face vs. hard mono) *is* scrappy-&-crisp made
visible.

- **Hero:** Clash Display ~`clamp(2.75rem, 8vw, 5rem)`, Bold, tight leading (1.05),
  slight negative tracking. Sentence case or lowercase — never SHOUTING CAPS.
- **Section titles:** Clash Display `clamp(1.75rem, 4vw, 2.5rem)`.
- **Body:** Satoshi, 16–18px, line-height 1.6.
- **Eyebrows / labels / kbd / status:** JetBrains Mono, 12–13px, uppercase,
  `letter-spacing 0.08em`. (e.g. `01 — HOW HE WORKS`, `$ npx ringtail raid`,
  `✓ scope validated`.)
- **Code blocks:** JetBrains Mono on `--surface`/graveyard, warm syntax tint. The
  `.env.example` manifest and the "wrote to .env.local + Infisical" lines are hero copy.

### Banned type
- No cold tech-default Inter *as the display face* (Inter is a body fallback only).
- No ALL-CAPS headlines (that's enterprise). Caps live only in mono eyebrows/labels.
- No more than these 3 families visible at once.

---

## 4. Motion (locked)

| Token | Value | Use |
|---|---|---|
| `--ease-effortless` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default. Smooth confident landing. |
| `--ease-snap` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | The gen-z bounce — hovers, chips, the tail-flick, a key snapping into a pocket. Tasteful overshoot. |
| `--dur-quick` | `150ms` | Hover, focus. |
| `--dur-base` | `250ms` | Most transitions. |
| `--dur-slow` | `400ms` | Reveals, the key-validated glint, the sort-into-pocket handoff. |

- **Signature motion — "the glint":** when a scope validates, the key flashes acid
  moonlight for one frame, then settles to sacred `--green` with a single soft pulse. This
  is the product's hero moment (scope validated / key works); animate it with love.
- **Signature motion — "the sort":** keys deal one-by-one into dev/staging/prod pockets on
  `--ease-snap`, a beat apart — provisioning made visible.
- **Effortless scroll reveals:** fade + 12px rise on `--ease-effortless`. Use CSS +
  IntersectionObserver, **not** framer-motion `whileInView` (back-nav blank bug).
- **Banned:** stiff linear easing, slow >600ms UI transitions, spinner-heavy loading
  (use skeletons / a deadpan Rocco "rummaging" loop), any breathing/pulsing orb.

---

## 5. Shape, depth, spacing

- **Radius:** friendly, not enterprise-sharp. `--r-sm: 8px` (buttons, inputs),
  `--r-md: 12px` (cards, stash-pockets), `--r-pill: 999px` (tags, the synced badge).
- **Shadows — warm-tinted only.** `--shadow-soft: 0 8px 24px -10px rgba(33,26,30,.20)`,
  `--shadow-float: 0 20px 44px -20px rgba(33,26,30,.28)`. Warm plum tint, never cool
  grey. One elevation step; don't stack shadows.
- **Spacing:** 4px base. Generous air — the landing breathes (Resend/Linear density,
  not dashboard-cram).
- **Layout:** confident, slightly asymmetric where it earns it; content max ~1120px.

---

## 6. Components & signatures

- **CTA (primary):** solid `--amber`, `--ink` text (amber is light enough for dark text —
  higher contrast + friendlier than white-on-amber), `--r-sm`, JetBrains Mono label or
  Satoshi medium, hover → `--amber-deep` + a `--ease-snap` micro-lift.
- **CTA (secondary):** ghost — `--line` border, `--ink` text, transparent fill.
- **The manifest snippet** is a first-class component: mono, `--surface`/graveyard card, a
  copy button, a `$` prompt. Show `.env.example` → the raid → `✓ wrote .env.local +
  Infisical`. It belongs *in the hero*.
- **Synced badge:** sacred `--green` dot + "scope validated" / "in sync" — the green's home.
- **Key rows:** a validated key shows a `--green` left-edge + the synced dot; a dud/expired
  key is flat `--grey` with a strike, echoing Rocco flicking it away. `--r-md`, warm.
- **Stash-pockets:** three labelled cards (dev / staging / prod) keys deal into — the
  per-environment provisioning motif made literal.
- **Ringtail mark** — the logo. The wordmark's terminal letter tail curling into a small
  brass keyring (custom SVG, ink on cream / cream on graveyard, amber keyring glint).
  Rocco's face works as favicon / app icon / GitHub avatar.
- **CLI-as-hero:** real `ringtail` output on the landing, syntax-tinted, not screenshots.

### Banned components
- Cold blue-grey enterprise "secrets management" cards. Gradient-purple "AI" buttons.
  Vault-style compliance tables. Emoji soup. "Book a demo" / "Contact sales" bars.
  Cookie-wall theatrics. Any browser-bot / login-puppeting screenshot.

---

## 7. Logo & wordmark (direction)

- **Wordmark:** "Ringtail" — Clash Display, the terminal letter's tail curling into a
  small brass keyring; `--ink` on `--cream`, amber keyring glint. Warm, chunky,
  lowercase-friendly.
- **Mark alone:** Rocco's masked face (or the keyring-tail loop), usable as favicon / app
  icon / GitHub avatar — amber/ink on cream (light) or cream on graveyard (dark).
- Assets to generate (on-brand): the keyring wordmark, Rocco hero (flat-bold sticker), the
  full expression sheet (§7.5), OG/social card, a hero scene (the 2am moonlit dumpster
  raid). Background-removed via green-screen prompt.

---

## 7.5 BOLD layer — Rocco the mascot & the gen-z / 2026 energy

Night Shift is the *system*; this is the *attitude*. Ringtail must be unmistakable in a
feed — bold, deadpan, screenshot-bait. **Scrappy ≠ timid.** We go loud on purpose.

### Rocco — the mascot
Ringtail has a character: **Rocco**, a ringtail (trash-panda / raccoon-cousin) with a
bandit mask and a scheme — scrappy, deadpan, quietly competent. The loyal night-shift
bandit who already raided your token pages last night while you slept. Unbothered, a
little smug, never creepy. Peak "he's just a little guy." The only thief you'd trust with
every key you own. His fat ringed tail IS your keyring — the whole name is the pun.

Rocco is the viral surface: reaction stickers, loading states, 404s, Discord/Telegram
emotes, launch memes. Personality = says little, raids a lot; the friend who already
handled it before you asked.

**Style (hard rule):** flat, bold, **single-weight bandit-ink outline + solid flat
fills** — sticker-ready, die-cut, Discord-emoji-native. **NEVER gradient / 3D / glossy.**
A character with a mask and a face is our anti-orb.

**Expression sheet to generate** (each maps to a product state):
- **chill** — default, arms relaxed, fat ringed tail curled into a brass keyring loaded
  with mismatched keys.
- **rummaging** — head-in-dumpster, tail up, raiding a provider's token pages for loot →
  *loading / mid-raid*.
- **inspecting-key (SUCCESS)** — one eyebrow up, holding a single key to the moonlight;
  the key glows sacred `--green` → *scope validated / key works*.
- **wrong-scope (ERROR)** — nose wrinkled, holding a dull `--grey` dud key at arm's length,
  flicking it away → *wrong scope / dead token, rejected*.
- **sorting-loot** — keys fanned like playing cards, dealing each into the right
  stash-pocket → *provisioning across dev / staging / prod*.
- **guarding** — arms crossed on top of a key-pile, mask dead-serious → *secured & in sync*.
- **snoozing-on-the-hoard** — slouchy nightcap, zzz, curled on the stash → *zero-touch
  autopilot*.
- **mind-blown** — shiny-eyed, fangs out, keyring tail flaring → *launch / big-win moment*.

→ ship as stickers + OG variants + Discord/Telegram emotes + hoodie print.

### Bold accents (extends §2 — spice, used loud but sparse)
| Token | Hex | Role |
|---|---|---|
| `--acid` | `#E8FF4B` | Acid moonlight — the electric highlight. Big blocks, the "wow", social cards, key-glints. |
| `--hot` | `#FF5C8A` | Hot jolt — energy, hovers, Rocco's cheek-blush, launch chrome, active links. |

`--amber` stays the workhorse; `--acid`/`--hot` are the loud cousins for hero blocks,
sticker fills, and section breaks. `--berry` carries nocturnal depth. Sacred `--green` is
still *synced-only*.

### Bolder type
Crank it. Hero Clash Display goes HUGE — `clamp(3.5rem, 12vw, 8rem)`, Bold, tight,
lowercase, hand on the tracking. Mix **mono status blocks** as counterpoint; a single
oversized word can be a full-bleed screen ("raided."). Type is allowed to break the grid
and be too big on purpose.

### Viral surfaces (design for the screenshot)
- **Hero is a scene, not a form** — Rocco mid-raid in the 2am moonlit dumpster-alley,
  keyring-tail loaded, a fading wall of provider token-pages behind him.
- **Rocco sticker sheet** (in repo + Discord/Telegram emotes) — the free-distribution
  virality play.
- **Meme-template OG cards** ("me: 15 token pages, wrong scopes, per-env drift · Rocco:
  *already handled it*").
- **The "wall of token pages" gag** — a scrolling wall of provider auth screens that
  Rocco's raid collapses into one tidy `.env.local`.
- Motion with attitude: `--ease-snap` bounce, hover reactions, a Rocco whose tail flicks,
  the glint-to-green key. Nothing static.

### Bold ≠ sloppy
Loud + confident, never ugly-for-ugly's-sake or unreadable. Contrast stays AA. Acid/hot
are *spice* — a whole page of acid is a headache, not a brand. Sacred green stays sacred.
Hero clarity still wins.

---

## 8. The "we don't do this" list

- **The breathing "AI orb" / glowing gradient blob.** The single biggest tell of a generic
  AI app in 2026 — a floating pulsing sphere/gradient in the hero. BANNED. Rocco (a
  character with a mask and a face) is our anti-orb. No breathing circles, no
  aurora-gradient blobs, no "AI energy" mist.
- Cold blue-grey enterprise / secrets-vault palette (Vault, Doppler, Infisical, 1Password
  slate). Brown-black night ground only, never blue-black.
- ALL-CAPS headlines; Inter as the display face.
- Neon or glowing anything — amber is baked, acid is a flash not a light source.
- Spending sacred green on decoration (it means *scope validated / key works / synced* only).
- Stacked cold-grey shadows; sharp-corner enterprise cards.
- "Book a demo" / "Contact sales" / "enterprise-grade secrets management" energy anywhere.
- Any browser-bot / login-puppeting imagery — Rocco drives **official provider APIs**; the
  human only clicks "allow" once.
- Cutesy OR creepy Rocco — he's deadpan and competent, never either. Gradient/3D mascot
  renders. Emoji soup. Stock "AI robot" imagery. Gradient-purple AI clichés.
- framer-motion `whileInView` (back-nav blank bug).

---

## 9. Provenance

Derived from `_bible.md` (Night Shift theme, the ringed-tail-as-keyring pun, the
locked palette + Rocco expression set) and the "Night Shift" direction set at founding.
Mirrors the structure of the sibling krispyai `design-lock.md`. Firms up as the landing +
CLI ship; update this doc when a new convention lands. Token/banned-list changes are
deliberate — they're the spine.
