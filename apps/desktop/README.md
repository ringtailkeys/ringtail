# Ringtail — native desktop app (Tauri v2)

The paid product: Ringtail as a **native macOS + Windows app**, not a browser tab.
It's the *same* `apps/dashboard` UI that `ringtail up` serves in a browser — one
codebase, two shells. The native shell adds what a browser can't: a unified title bar
with inset traffic lights, real window vibrancy (macOS NSVisualEffect / Windows Mica),
a menu-bar Rocco, and a bundled daemon that starts and stops with the app.

## How it works (the DRY wiring)

```
┌─────────────────────────── Ringtail.app ───────────────────────────┐
│  Tauri (Rust) shell                                                 │
│   1. picks a free 127.0.0.1 port                                    │
│   2. spawns the bundled daemon SIDECAR with                         │
│        PORT=<port>  RINGTAIL_SERVE_DIST=<bundled apps/dashboard>     │
│   3. waits for the port to answer, then navigates the webview to    │
│        http://127.0.0.1:<port>   ← the daemon serves the dashboard  │
│      (same-origin, exactly like `ringtail up`, so live.ts is        │
│       UNCHANGED: /api, /events (SSE), /mcp all hit the daemon)       │
│   4. applies vibrancy + injects ONE translucency CSS tweak          │
│   5. on quit, kills the sidecar (no orphaned loopback server)       │
└─────────────────────────────────────────────────────────────────────┘
```

- **No forked UI.** The dashboard lives once in `apps/dashboard`; both shells load it.
  Any UI polish goes into the shared `apps/dashboard` / `libs/ui` — never here.
- **The daemon is a sidecar.** `bun build --compile` turns `services/daemon` into a
  standalone binary (Bun runtime embedded — the user needs no Bun). Tauri bundles it
  and spawns it; see `scripts/build-sidecar.ts`.
- **The dashboard is a resource.** `apps/dashboard/dist` is bundled into the app and
  handed to the daemon as `RINGTAIL_SERVE_DIST`.

## Prerequisites (one-time, per machine)

| Need | macOS | Windows |
|------|-------|---------|
| **Rust** | `curl https://sh.rustup.rs -sSf \| sh` | [rustup-init.exe](https://rustup.rs) |
| **Bun** | `curl -fsSL https://bun.sh/install \| bash` | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| **System toolchain** | Xcode Command Line Tools: `xcode-select --install` | [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2 (preinstalled on Win 11) |

Then, from the repo root: `bun install`.

## Run it (dev)

```bash
cd apps/desktop
bun run dev          # = tauri dev
```

`beforeDevCommand` builds the dashboard + compiles the daemon sidecar first, so a
plain `bun run dev` is all you need. First run compiles Rust (a few minutes); after
that it's incremental.

## Build a distributable

```bash
cd apps/desktop
bun run build        # = tauri build  →  builds dashboard + sidecar, then bundles
```

Output lands in `src-tauri/target/release/bundle/`:

- **macOS** → `dmg/Ringtail_<ver>_<arch>.dmg` and `macos/Ringtail.app`
- **Windows** → `nsis/Ringtail_<ver>_x64-setup.exe` and `msi/Ringtail_<ver>_x64_en-US.msi`

> Build on the target OS. Tauri does not cross-compile the system webview — build the
> macOS artifacts on a Mac and the Windows artifacts on Windows (or in CI runners).
> For a universal Mac binary: `bun run build -- --target universal-apple-darwin`.

## Code-signing + notarization (ship it for real)

An unsigned app triggers Gatekeeper (macOS "unidentified developer") / SmartScreen
(Windows). To ship, sign on each platform.

### macOS — Apple Developer Program ($99/yr)

1. In your Apple Developer account create a **Developer ID Application** certificate;
   install it into the login keychain (double-click the `.cer`).
2. Create an app-specific password for notarization at appleid.apple.com.
3. Set env vars, then `bun run build` — Tauri signs **and** notarizes in one pass:

   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   # notarization (either an API key OR the Apple-ID trio):
   export APPLE_API_KEY="/path/AuthKey_XXXX.p8"
   export APPLE_API_KEY_ID="XXXXXXXXXX"
   export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   # …or:
   # export APPLE_ID="you@example.com"
   # export APPLE_PASSWORD="app-specific-password"
   # export APPLE_TEAM_ID="TEAMID"

   bun run build
   ```

   Tauri staples the notarization ticket to the `.dmg`. Verify:
   `spctl -a -vvv -t install "…/Ringtail.app"` → should say *accepted, source=Notarized*.

### Windows — Authenticode code-signing certificate

1. Buy an **OV or EV code-signing certificate** (DigiCert / Sectigo / SSL.com). EV
   clears SmartScreen reputation immediately; OV warms up over time.
2. Point Tauri at it via `src-tauri/tauri.conf.json` → `bundle.windows.certificateThumbprint`
   (+ `signCommand`/`digestAlgorithm` if using a cloud HSM token), or set:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "…"   # for the updater; app signing uses the cert below
   ```

   For the installer, the standard path is a thumbprint of an installed cert:

   ```jsonc
   // tauri.conf.json → bundle.windows
   "certificateThumbprint": "A1B2C3…",
   "digestAlgorithm": "sha256",
   "timestampUrl": "http://timestamp.digicert.com"
   ```

   Then `bun run build` signs the `.exe`/`.msi` during bundling.
3. Verify: right-click the installer → **Properties → Digital Signatures**, or
   `signtool verify /pa Ringtail_<ver>_x64-setup.exe`.

## Icons

`src-tauri/icons/` is a complete Tauri icon set (Rocco waving on the Night Shift amber
squircle), generated from `apps/.brand-assets/rocco-waving.png`. To regenerate from a
new 1024×1024 source: `bun tauri icon path/to/source-1024.png`.

## What's verified vs. what needs your machine

- ✅ **Verified in this repo:** the dashboard typechecks + builds, the daemon compiles
  to a standalone sidecar (`bun run build:sidecar`), `tauri.conf.json` is valid, the
  icon set is complete, and all the polish renders (see the screenshot in the PR).
- ⏳ **Needs your Mac / Windows box:** the Rust/Tauri native compile (`bun run build`)
  and the code-sign + notarize steps above — these require the platform toolchain and
  your developer certificates, which can't run in CI-less sandboxes.
