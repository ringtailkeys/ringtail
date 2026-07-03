import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * @ringtail/dashboard — the LOCAL cockpit. Vite (not Next) because localhost has
 * no SEO to serve; a fast SPA that polls the daemon is the whole job.
 *
 * `$PORT` wins (Tilt/portless inject it, same contract as the daemon); falls back
 * to the dashboard port from the env manifest's default (see @ringtail/config,
 * DASHBOARD_PORT=4881) so the two never collide locally.
 */
const port = Number(process.env.PORT) || 4881;

// Rocco's PNGs live one bucket up in apps/.brand-assets — let the dev server read them.
const brandAssets = fileURLToPath(new URL("../.brand-assets", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { port, fs: { allow: [".", brandAssets] } },
});
