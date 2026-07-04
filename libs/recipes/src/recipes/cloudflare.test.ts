import { describe, expect, test } from "bun:test";
import { buildTokenCreateUrl, classifyProbe, parseVerify, summarizeScopes } from "./cloudflare";

describe("buildTokenCreateUrl — the pre-scoped deep-link", () => {
  test("targets CF's user-token template page with the pre-scope params", () => {
    const url = new URL(buildTokenCreateUrl("my-app"));
    expect(url.origin + url.pathname).toBe("https://dash.cloudflare.com/profile/api-tokens");
    expect(url.searchParams.get("accountId")).toBe("*");
    expect(url.searchParams.get("zoneId")).toBe("all");
    expect(url.searchParams.get("name")).toBe("my-app");
  });

  test("permissionGroupKeys decodes to the exact CF permission keys + access levels", () => {
    const url = new URL(buildTokenCreateUrl());
    const groups = JSON.parse(url.searchParams.get("permissionGroupKeys")!) as Array<{
      key: string;
      type: string;
    }>;
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.type]));
    expect(byKey).toEqual({
      account_settings: "read",
      page: "edit",
      workers_scripts: "edit",
      workers_kv_storage: "edit",
      workers_r2: "edit",
      dns: "edit",
    });
  });
});

describe("parseVerify — GET /user/tokens/verify", () => {
  test("active token → active with its id", () => {
    const o = parseVerify(200, { success: true, result: { id: "abc123", status: "active" } });
    expect(o.active).toBe(true);
    expect(o.tokenId).toBe("abc123");
  });

  test("disabled / expired token → not active, names the status", () => {
    expect(parseVerify(200, { success: true, result: { status: "disabled" } }).active).toBe(false);
    expect(parseVerify(200, { success: true, result: { status: "expired" } }).detail).toContain(
      "expired",
    );
  });

  test("401/403 → invalid or revoked", () => {
    expect(parseVerify(401, {}).detail).toContain("invalid or revoked");
    expect(parseVerify(403, {}).active).toBe(false);
  });

  test("success:false surfaces the CF error message", () => {
    const o = parseVerify(400, { success: false, errors: [{ message: "Invalid API Token" }] });
    expect(o.active).toBe(false);
    expect(o.detail).toContain("Invalid API Token");
  });

  test("network error (status 0) → reachability message", () => {
    expect(parseVerify(0, { error: "fetch failed" }).detail).toContain("network error");
  });
});

describe("classifyProbe — precise wrong-scope detection", () => {
  test("200 → granted", () => {
    expect(classifyProbe(200, { success: true, result: [] })).toBe("granted");
  });

  test("403 → missing", () => {
    expect(classifyProbe(403, { success: false })).toBe("missing");
  });

  test("CF authz code 9109 (non-403 body) → missing", () => {
    expect(classifyProbe(400, { success: false, errors: [{ code: 9109 }] })).toBe("missing");
  });

  test("transient 5xx / network → unknown, never a false wrong-scope", () => {
    expect(classifyProbe(500, {})).toBe("unknown");
    expect(classifyProbe(0, {})).toBe("unknown");
  });
});

describe("summarizeScopes — partition verdicts", () => {
  test("splits granted / missing / unknown by label", () => {
    const { scopes, missing, unknown } = summarizeScopes([
      { label: "Account Settings: Read", verdict: "granted" },
      { label: "Workers R2 Storage: Edit", verdict: "missing" },
      { label: "DNS: Edit", verdict: "unknown" },
    ]);
    expect(scopes).toEqual(["Account Settings: Read"]);
    expect(missing).toEqual(["Workers R2 Storage: Edit"]);
    expect(unknown).toEqual(["DNS: Edit"]);
  });

  test("all granted → no missing (the ok path)", () => {
    const { missing } = summarizeScopes([
      { label: "a", verdict: "granted" },
      { label: "b", verdict: "granted" },
    ]);
    expect(missing).toHaveLength(0);
  });
});
