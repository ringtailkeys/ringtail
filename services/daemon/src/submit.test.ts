// Event-driven auto-advance: a `paste` to applyStep runs the NEXT safe auto step
// itself (mint → validate-after-mint → provision → sync) through the SAME runEngine
// path executeStep uses — no agent round-trip. Driven against the offline mock
// provider (zero real cloud), same wiring as no-leak.test.ts.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockProvider, type MockProvider, type Wizard } from "@ringtail/core";
import { DaemonStore } from "./state";
import { applyStep } from "./submit";

const PASTED = "SECRET-PASTE-VALUE-9999";

const WIZARD: Wizard = {
  id: "wiz-cloudflare",
  title: "Connect Cloudflare",
  provider: "cloudflare", // must be a seeded grid row (RECIPES id)
  steps: [
    {
      id: "s-paste",
      title: "Paste token",
      description: "🔒 goes to Ringtail",
      kind: "paste",
      payload: { varName: "CLOUDFLARE_API_TOKEN" },
      status: "pending",
    },
    {
      id: "s-auto",
      title: "Provision",
      description: "",
      kind: "auto",
      danger: "safe",
      status: "pending",
    },
  ],
};

let dir: string;
let mock: MockProvider;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ringtail-autoadv-"));
  mock = startMockProvider();
  process.env.RINGTAIL_HOME = join(dir, "home");
  process.env.MOCK_PROVIDER_URL = mock.url;
  process.env.INFISICAL_API_URL = mock.url;
  process.env.INFISICAL_CLIENT_ID = "mock-client-id";
  process.env.INFISICAL_CLIENT_SECRET = "mock-client-secret";
  process.env.INFISICAL_PROJECT_ID = "mock-project";
});

afterAll(() => {
  mock.stop();
  rmSync(dir, { recursive: true, force: true });
});

test("a paste auto-advances the next safe auto step to synced", async () => {
  const store = new DaemonStore();
  store.setWizard(WIZARD);

  const res = await applyStep(store, "s-paste", PASTED, {
    repoName: "ringtail",
    envLocalPath: join(dir, ".env.local"),
  });

  // The paste completed AND the daemon ran the next auto step itself.
  expect(res.status).toBe("done");
  expect(res.autoAdvanced).toBeDefined();
  expect(res.autoAdvanced?.stepId).toBe("s-auto");
  expect(res.autoAdvanced?.failure).toBeNull();

  // The auto step is checked off and the grid flipped to synced across the axis.
  expect(store.findStep("s-auto").status).toBe("done");
  const row = store.snapshot().grid.find((r) => r.provider === "cloudflare");
  expect(row?.envs.local).toBe("synced");
  expect(row?.envs.prod).toBe("synced");

  // THE GUARANTEE: the pasted secret is nowhere in the returned result.
  expect(JSON.stringify(res)).not.toContain(PASTED);
});

test("no auto step next → no auto-advance (paste alone)", async () => {
  const store = new DaemonStore();
  store.setWizard({
    ...WIZARD,
    steps: [WIZARD.steps[0]!], // paste with nothing after it
  });
  const res = await applyStep(store, "s-paste", PASTED, {
    repoName: "ringtail",
    envLocalPath: join(dir, ".env.local"),
  });
  expect(res.status).toBe("done");
  expect(res.autoAdvanced).toBeUndefined();
});
