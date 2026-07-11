import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import {
  buildAuthorizeUrl,
  generatePkce,
  getOAuthProvider,
  listConnectors,
  OAUTH_PROVIDERS,
} from "./oauth";

const b64url = (buf: Buffer): string => buf.toString("base64url");

test("PKCE challenge is the base64url SHA-256 of the verifier (S256)", () => {
  const { verifier, challenge } = generatePkce();
  expect(challenge).toBe(b64url(createHash("sha256").update(verifier).digest()));
  // base64url only — no +, /, or = padding (else the provider rejects it).
  expect(challenge).not.toMatch(/[+/=]/);
  // two fresh pairs never collide (real entropy).
  expect(generatePkce().verifier).not.toBe(verifier);
});

test("buildAuthorizeUrl carries client_id, loopback redirect, state, and the S256 challenge", () => {
  process.env.RINGTAIL_OAUTH_GITHUB_CLIENT_ID = "gh-client-123";
  const p = OAUTH_PROVIDERS.github!;
  const url = new URL(
    buildAuthorizeUrl(p, {
      redirectUri: "http://127.0.0.1:4880/oauth/callback",
      state: "st-abc",
      challenge: "chal-xyz",
    }),
  );
  expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("gh-client-123");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:4880/oauth/callback");
  expect(url.searchParams.get("state")).toBe("st-abc");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("code_challenge")).toBe("chal-xyz");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  delete process.env.RINGTAIL_OAUTH_GITHUB_CLIENT_ID;
});

test("buildAuthorizeUrl refuses a provider with no client id", () => {
  delete process.env.RINGTAIL_OAUTH_GOOGLE_CLIENT_ID;
  expect(() =>
    buildAuthorizeUrl(OAUTH_PROVIDERS.google!, {
      redirectUri: "http://127.0.0.1:4880/oauth/callback",
      state: "s",
      challenge: "c",
    }),
  ).toThrow(/client id/);
});

test("getOAuthProvider: unknown → null; mock resolves from env at call time", () => {
  expect(getOAuthProvider("does-not-exist")).toBeNull();
  delete process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL;
  delete process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL;
  expect(getOAuthProvider("mock")).toBeNull(); // no env → not configured, never crashes
  process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL = "http://127.0.0.1:1/authorize";
  process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL = "http://127.0.0.1:1/token";
  expect(getOAuthProvider("mock")?.authorizeUrl).toBe("http://127.0.0.1:1/authorize");
  delete process.env.RINGTAIL_OAUTH_MOCK_AUTHORIZE_URL;
  delete process.env.RINGTAIL_OAUTH_MOCK_TOKEN_URL;
});

test("listConnectors flags a provider with no client credentials (value-free)", () => {
  delete process.env.RINGTAIL_OAUTH_VERCEL_CLIENT_ID;
  const vercel = listConnectors().find((c) => c.id === "vercel");
  expect(vercel?.needsClientCreds).toBe(true);
  expect(vercel?.signupUrl).toBe("https://vercel.com/signup");
  // no token field anywhere on the connector catalogue.
  expect(JSON.stringify(listConnectors())).not.toMatch(/access_token|refresh_token|"token"/);
});
