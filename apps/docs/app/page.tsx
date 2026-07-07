"use client";

import { useEffect } from "react";

/**
 * The docs site is all docs — the root sends you to the Quickstart.
 *
 * Client-side redirect, not the runtime `redirect("/docs")`: with `output: "export"`
 * there is no server to emit a 3xx, so `/` is prerendered to a static `index.html`.
 * On Cloudflare Pages the real 302 happens at the edge via `public/_redirects` before
 * this HTML is ever served; this effect is the fallback (and what `next dev` uses).
 */
export default function Home() {
  useEffect(() => {
    window.location.replace("/docs");
  }, []);

  return (
    <p style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      Redirecting to <a href="/docs">the docs</a>…
    </p>
  );
}
