import { expect, test } from "bun:test";
import type { MintChoices } from "@ringtail/core";
import { defaultSelection, isSelectionComplete, viewChoices } from "./choice";

const single: MintChoices = {
  resources: [
    { id: "d1", name: "acme.com" },
    { id: "d2", name: "staging.acme.com" },
  ],
  permissions: ["sending_access", "full_access"],
  suggestedPermission: "sending_access",
  supportsExpiry: false,
};

const multiRoot: MintChoices = {
  ...single,
  roots: [
    { id: "r1", provider: "resend", label: "prod", createdAt: 1 },
    { id: "r2", provider: "resend", label: "staging", createdAt: 2 },
  ],
};

test("default permission is the narrowest (suggested), resource is the first", () => {
  const sel = defaultSelection(viewChoices(single));
  expect(sel.permission).toBe("sending_access");
  expect(sel.resource).toBe("d1");
  expect(sel.rootId).toBeUndefined(); // single-root → no root pick
});

test("multi-root pre-selects the first root and requires one to complete", () => {
  const view = viewChoices(multiRoot);
  const sel = defaultSelection(view);
  expect(sel.rootId).toBe("r1");
  expect(isSelectionComplete(view, sel)).toBe(true);
  expect(isSelectionComplete(view, { ...sel, rootId: undefined })).toBe(false); // root required
  expect(isSelectionComplete(view, { ...sel, rootId: "bogus" })).toBe(false); // must be one offered
});

test("incomplete when resource/permission is off-menu", () => {
  const view = viewChoices(single);
  expect(isSelectionComplete(view, { resource: "", permission: "sending_access" })).toBe(false);
  expect(isSelectionComplete(view, { resource: "d1", permission: "root" })).toBe(false);
});

test("viewChoices is value-free — it drops any smuggled secret field", () => {
  // Simulate a daemon regression that leaks a value on the resource + a stray token field.
  const leaky = {
    ...single,
    resources: [{ id: "d1", name: "acme.com", value: "sk_live_LEAK", secret: "x" }],
    token: "sk_live_LEAK",
  } as unknown as MintChoices;
  const view = viewChoices(leaky);
  const json = JSON.stringify(view);
  expect(json).not.toContain("LEAK");
  expect(json).not.toContain("secret");
  expect(view.resources[0]).toEqual({ id: "d1", name: "acme.com" });
});
