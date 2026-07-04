// The one check the typed executor needs (ponytail: deterministic, no network).
// domain→CF must (1) succeed, (2) report the CF nameservers as a PUBLIC change,
// and (3) NEVER carry a secret value — the guarantee holds for actions too.
import { expect, test } from "bun:test";
import { ACTION_EXECUTORS, executeDomainToCf } from "./actions";

test("domain→CF repoints nameservers to Cloudflare, value-free", async () => {
  const r = await executeDomainToCf({ domain: "krispy.ai" });
  expect(r.status).toBe("done");
  expect(r.action).toBe("domain-to-cf");
  expect(r.changes?.[0]?.to).toContain("ns.cloudflare.com");
  expect(JSON.stringify(r)).toContain("krispy.ai"); // the domain (public) is echoed
  // No secret-shaped token ever appears in an action result.
  expect(JSON.stringify(r)).not.toContain("mock-token");
});

test("registry dispatches the domain-to-cf executor", async () => {
  const exec = ACTION_EXECUTORS["domain-to-cf"];
  expect(exec).toBeDefined();
  expect((await exec!()).status).toBe("done");
});
