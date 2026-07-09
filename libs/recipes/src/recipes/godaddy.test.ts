// Unit: the GoDaddy recipe registration + the set-nameservers action shape. No network — we pin
// the STRUCTURE (endpoint, method, header, body) so a drift is caught. (The `discover` domain-list
// DiscoverySpec lives in @ringtail/core — recipes sits below core, so its shape is asserted there,
// in provision.test.ts, not here.)
import { expect, test } from "bun:test";
import { buildSetNameserversAction, recipe } from "./godaddy";

test("the recipe is registered value-free with both creds as root keys", () => {
  expect(recipe.id).toBe("godaddy");
  expect(recipe.envVars).toEqual(["GODADDY_API_KEY", "GODADDY_API_SECRET"]);
  expect(recipe.rootCredKeys).toEqual(["GODADDY_API_KEY", "GODADDY_API_SECRET"]);
});

test("set-nameservers: builds a value-free, human-confirm PUT for the chosen domain", () => {
  const ns = ["ns1.cloudflare.com", "ns2.cloudflare.com"];
  const action = buildSetNameserversAction("example.com", ns);
  expect(action.providerAccount).toBe("godaddy");
  expect(action.method).toBe("PUT");
  expect(action.url).toBe("https://api.godaddy.com/v1/domains/example.com");
  expect(action.headers.Authorization).toBe("sso-key {{ROOT}}"); // root substituted at send time
  expect(action.body).toEqual({ nameServers: ns });
  // A registrar NS swap is consequential → hard-confirm, and there's NO extract (a wire, not a mint).
  expect(action.danger).toBe("destructive");
  expect("extract" in action).toBe(false);
  // Value-free: nothing in the built action is a secret (the {{ROOT}} placeholder is not a value).
  expect(JSON.stringify(action)).not.toMatch(/secret|password/i);
});

test("set-nameservers encodes a domain safely into the path", () => {
  const action = buildSetNameserversAction("sub.example.co.uk", ["a", "b"]);
  expect(action.url).toBe("https://api.godaddy.com/v1/domains/sub.example.co.uk");
});
