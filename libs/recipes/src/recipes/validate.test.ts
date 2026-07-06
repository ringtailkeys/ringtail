import { afterEach, describe, expect, test } from "bun:test";
import { recipe as creem } from "./creem";
import { recipe as neon } from "./neon";
import { recipe as posthog } from "./posthog";
import { recipe as resend } from "./resend";

/**
 * validate() unit tests for the four guided recipes — NO real network. We stub
 * globalThis.fetch with a canned status + body and capture the request the recipe
 * made (URL + headers), so we assert BOTH the verdict (200 → ok, 401 → not ok) AND
 * that each recipe hit the right endpoint with the right auth header. The Creem case
 * specifically pins the `x-api-key` header + `/products/search` endpoint (the bug
 * these tests would catch if it regressed to Bearer/`/products`).
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  headers: Record<string, string>;
}

/** Stub fetch → always returns `status`+`body`; records the last request. */
function stubFetch(status: number, body: unknown): { last: () => Captured } {
  let last: Captured | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}),
    );
    last = { url: String(input), headers };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    last: () => {
      if (!last) throw new Error("fetch was never called");
      return last;
    },
  };
}

describe("neon.validate", () => {
  test("200 → ok, hits /api/v2/projects with Bearer", async () => {
    const cap = stubFetch(200, { projects: [{ id: "p1" }] });
    const r = await neon.validate!({ NEON_API_KEY: "neon_key" });
    expect(r.ok).toBe(true);
    expect(cap.last().url).toContain("/api/v2/projects");
    expect(cap.last().headers.Authorization).toBe("Bearer neon_key");
  });

  test("401 → not ok (invalid/expired)", async () => {
    stubFetch(401, {});
    const r = await neon.validate!({ NEON_API_KEY: "bad" });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("401");
  });

  test("missing key → not ok, no network", async () => {
    const r = await neon.validate!({});
    expect(r.ok).toBe(false);
  });
});

describe("posthog.validate", () => {
  test("200 → ok, Bearer personal key against US host by default", async () => {
    const cap = stubFetch(200, { results: [{ id: 1, name: "Proj" }] });
    const r = await posthog.validate!({ POSTHOG_PERSONAL_API_KEY: "phx_key" });
    expect(r.ok).toBe(true);
    expect(cap.last().url).toBe("https://us.posthog.com/api/projects/");
    expect(cap.last().headers.Authorization).toBe("Bearer phx_key");
  });

  test("EU ingestion host → EU API host", async () => {
    const cap = stubFetch(200, { results: [] });
    await posthog.validate!({
      POSTHOG_PERSONAL_API_KEY: "phx_key",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    });
    expect(cap.last().url).toBe("https://eu.posthog.com/api/projects/");
  });

  test("403 → not ok (rejected)", async () => {
    stubFetch(403, {});
    const r = await posthog.validate!({ POSTHOG_PERSONAL_API_KEY: "bad" });
    expect(r.ok).toBe(false);
  });

  test("missing personal key → not ok", async () => {
    const r = await posthog.validate!({});
    expect(r.ok).toBe(false);
  });
});

describe("creem.validate", () => {
  const creds = { CREEM_API_KEY: "creem_test_abc", CREEM_WEBHOOK_SECRET: "whsec_x" };

  test("200 → ok, uses x-api-key header + /v1/products/search (NOT Bearer)", async () => {
    const cap = stubFetch(200, { items: [] });
    const r = await creem.validate!(creds);
    expect(r.ok).toBe(true);
    expect(cap.last().url).toContain("/v1/products/search");
    expect(cap.last().headers["x-api-key"]).toBe("creem_test_abc");
    expect(cap.last().headers.Authorization).toBeUndefined();
  });

  test("401 → not ok (invalid/revoked)", async () => {
    stubFetch(401, {});
    const r = await creem.validate!(creds);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("401");
  });

  test("missing webhook secret → not ok", async () => {
    const r = await creem.validate!({ CREEM_API_KEY: "creem_test_abc" });
    expect(r.ok).toBe(false);
  });
});

describe("resend.validate", () => {
  test("200 → ok, hits /domains with Bearer", async () => {
    const cap = stubFetch(200, { data: [] });
    const r = await resend.validate!({ RESEND_API_KEY: "re_abc" });
    expect(r.ok).toBe(true);
    expect(cap.last().url).toContain("/domains");
    expect(cap.last().headers.Authorization).toBe("Bearer re_abc");
  });

  test("401 → not ok, flags missing full-access scope", async () => {
    stubFetch(401, {});
    const r = await resend.validate!({ RESEND_API_KEY: "re_sendonly" });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("full-access (read /domains)");
  });

  test("bad prefix → not ok, no network", async () => {
    const r = await resend.validate!({ RESEND_API_KEY: "wrong" });
    expect(r.ok).toBe(false);
  });
});
