import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT, jwtVerify } from "jose";
import { Store } from "../src/server/store.js";
import {
  Auth,
  beginAuthorization,
  validateCallback,
  safeAuthEndpoint,
  AUTH,
} from "../src/server/auth.js";
const redirectUri = "http://127.0.0.1:43119/auth/callback";
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "cade-auth-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return new Store(dir);
}
test("PKCE S256, nonce and state are fresh and initial client is dynamic", () => {
  const p = beginAuthorization({ hostId: "urn:uuid:test", redirectUri }),
    q = beginAuthorization({ hostId: "urn:uuid:test", redirectUri }),
    url = new URL(p.url);
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(p.verifier).digest("base64url"),
  );
  assert.notEqual(p.state, q.state);
  assert.notEqual(p.nonce, q.nonce);
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
});
test("callback rejects missing issued client, state mismatch, denial, expiry and registration changes", () => {
  const p = beginAuthorization({ hostId: "host", redirectUri }),
    params = new URLSearchParams({ state: p.state, code: "code" });
  assert.throws(() => validateCallback(p, params), /Registro/);
  params.set("client_id", "oaiapp_new");
  assert.equal(validateCallback(p, params).clientId, "oaiapp_new");
  params.set("state", "wrong");
  assert.throws(() => validateCallback(p, params), /inválido/);
  params.set("state", p.state);
  params.set("error", "access_denied");
  assert.throws(() => validateCallback(p, params), /recusada/);
  params.delete("error");
  assert.throws(
    () => validateCallback({ ...p, expires: 0 }, params),
    /expirado/,
  );
  assert.throws(
    () =>
      validateCallback(
        { ...p, registration: { client_id: "different" } },
        params,
      ),
    /divergente/,
  );
});
test("discovery endpoints cannot redirect credentials to an unrelated host", () => {
  for (const url of [
    "http://auth.openai.com/token",
    "https://evil.example/token",
    "https://auth.openai.com@evil.example/token",
  ])
    assert.throws(() => safeAuthEndpoint(url));
  assert.equal(
    safeAuthEndpoint(AUTH + "/oauth/revoke").hostname,
    "auth.openai.com",
  );
});
test("real JWT signatures validate issuer/audience/nonce before storing OAuth credentials", async (t) => {
  const store = await temporary(t),
    { privateKey, publicKey } = await generateKeyPair("RS256");
  let pending, posted;
  const auth = new Auth(store, {
    verifyFn: (token, keys, options) => jwtVerify(token, publicKey, options),
    fetchFn: async (url, options) => {
      if (String(url).includes("well-known"))
        return Response.json({
          issuer: AUTH,
          jwks_uri: AUTH + "/jwks",
          revocation_endpoint: AUTH + "/revoke",
        });
      posted = new URLSearchParams(options.body);
      const jwt = await new SignJWT({
        nonce: pending.nonce,
        email: "fixture@example.org",
      })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(AUTH)
        .setAudience("oaiapp_test")
        .setSubject("fixture-subject")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        id_token: jwt,
        expires_in: 3600,
        scope: "openid chatgpt.tokens.use.direct",
      });
    },
  });
  const url = new URL(await auth.start(redirectUri));
  pending = auth.pending.get(url.searchParams.get("state"));
  const key = await auth.callback(
    new URLSearchParams({
      state: pending.state,
      code: "fixture-code",
      client_id: "oaiapp_test",
    }),
  );
  assert.equal(posted.get("client_id"), "oaiapp_test");
  assert.equal(posted.get("code_verifier"), pending.verifier);
  assert.equal(posted.get("redirect_uri"), redirectUri);
  assert.equal((await auth.profiles()).active, key);
  assert.equal(await auth.access(), "fixture-access");
  const status = JSON.stringify(await auth.status());
  assert(!status.includes("fixture-access"));
  assert(!status.includes("fixture-refresh"));
  if (process.platform !== "win32")
    assert.equal(
      (await stat(join(store.dir, "accounts.json"))).mode & 0o777,
      0o600,
    );
  assert.equal(await store.read("registration-draft.json", {}), null);
});
test("nonce mismatch and changed identity never replace credentials", async (t) => {
  const store = await temporary(t),
    auth = new Auth(store, {
      verifyFn: async () => ({ payload: { nonce: "wrong", sub: "evil" } }),
      fetchFn: async (url) =>
        String(url).includes("well-known")
          ? Response.json({ issuer: AUTH, jwks_uri: AUTH + "/jwks" })
          : Response.json({
              id_token: "fixture",
              access_token: "bad",
              expires_in: 3600,
            }),
    });
  const url = new URL(await auth.start(redirectUri));
  await assert.rejects(
    auth.callback(
      new URLSearchParams({
        state: url.searchParams.get("state"),
        code: "code",
        client_id: "issued",
      }),
    ),
    /Identidade/,
  );
  assert.deepEqual((await auth.profiles()).accounts, {});
});
test("failed exchange retains issued client for a fresh authorization", async (t) => {
  const store = await temporary(t),
    auth = new Auth(store, {
      fetchFn: async () => new Response("", { status: 400 }),
    });
  const first = new URL(await auth.start(redirectUri));
  await assert.rejects(
    auth.callback(
      new URLSearchParams({
        state: first.searchParams.get("state"),
        code: "expired-code",
        client_id: "issued-retry",
      }),
    ),
  );
  const next = new URL(await auth.start(redirectUri));
  assert.equal(next.searchParams.get("client_id"), "issued-retry");
  assert.notEqual(
    next.searchParams.get("state"),
    first.searchParams.get("state"),
  );
});
test("identity alone does not grant inference access", async (t) => {
  const store = await temporary(t);
  await store.write("accounts.json", {
    active: "a",
    accounts: {
      a: {
        access_token: "identity-only",
        scopes: ["openid"],
        expires: Date.now() + 3600000,
      },
    },
  });
  await assert.rejects(new Auth(store).access(), /autorize o uso/);
});
test("simultaneous refreshes rotate one registration atomically", async (t) => {
  const store = await temporary(t);
  await store.write("accounts.json", {
    active: "a",
    accounts: {
      a: {
        client_id: "issued",
        subject: "sub",
        access_token: "old",
        refresh_token: "old-refresh",
        scopes: ["chatgpt.tokens.use.direct"],
        expires: 0,
      },
    },
  });
  let calls = 0;
  const auth = new Auth(store, {
    fetchFn: async (url, opts) => {
      calls++;
      assert.equal(new URLSearchParams(opts.body).get("client_id"), "issued");
      await new Promise((r) => setTimeout(r, 20));
      return Response.json({
        access_token: "new",
        refresh_token: "new-refresh",
        expires_in: 3600,
      });
    },
  });
  assert.deepEqual(
    await Promise.all([auth.access(), auth.access(), auth.access()]),
    ["new", "new", "new"],
  );
  assert.equal(calls, 1);
  assert.equal((await auth.profiles()).accounts.a.refresh_token, "new-refresh");
});
test("logout clears credentials while preserving account registration and host", async (t) => {
  const store = await temporary(t),
    host = await store.host();
  await store.write("accounts.json", {
    active: "a",
    accounts: {
      a: {
        client_id: "issued",
        subject: "sub",
        access_token: "fixture",
        refresh_token: "fixture-r",
        id_token: "fixture-i",
      },
    },
  });
  const auth = new Auth(store, {
    fetchFn: async (url) =>
      String(url).includes("well-known")
        ? Response.json({
            issuer: AUTH,
            jwks_uri: AUTH + "/jwks",
            revocation_endpoint: AUTH + "/revoke",
          })
        : new Response("", { status: 200 }),
  });
  assert.equal((await auth.logout("a")).revoked, true);
  const db = await auth.profiles();
  assert.equal(db.active, null);
  assert.equal(db.accounts.a.client_id, "issued");
  assert.equal(db.accounts.a.access_token, undefined);
  assert.equal(db.accounts.a.refresh_token, undefined);
  assert.equal(await store.host(), host);
});
