import { request } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, validOrigin } from "../src/server/main.js";
import { Store } from "../src/server/store.js";
test("origin allowlist rejects arbitrary sites and malformed extension IDs", () => {
  assert(validOrigin("http://127.0.0.1:43119", "http://127.0.0.1:43119"));
  assert(validOrigin("chrome-extension://" + "a".repeat(32), "local"));
  for (const s of [
    "null",
    "https://evil.example",
    "chrome-extension://bad",
    "http://localhost:43119",
  ])
    assert(!validOrigin(s, "http://127.0.0.1:43119"));
});
test("HTTP pairing, host/origin guards, personal isolation and revisions", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cade-http-")),
    store = new Store(dir),
    app = await createApp({ store, port: 43120 });
  await new Promise((r) => app.server.listen(43120, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = app.base,
    headers = { Origin: base, "Content-Type": "application/json" };
  assert.equal((await fetch(base + "/api/catalog", { headers })).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/health", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    await new Promise((resolve, reject) => {
      const r = request(
        base + "/api/health",
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      r.on("error", reject);
      r.end();
    }),
    403,
  );
  const pair = await fetch(base + "/api/pair", {
    method: "POST",
    headers,
    body: JSON.stringify({ code: app.pairingCode }),
  });
  assert.equal(pair.status, 200);
  headers["X-Cade-Session"] = (await pair.json()).session;
  assert.equal((await fetch(base + "/api/catalog", { headers })).status, 200);
  const personal = await (await fetch(base + "/api/personal", { headers })).json();
  assert.equal(personal.profile, "personal-local.json");
  const save = () =>
    fetch(base + "/api/personal", {
      method: "PUT",
      headers,
      body: JSON.stringify(personal),
    });
  assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 400);
  await store.write("accounts.json", {
    active: "other",
    accounts: { other: { client_id: "test", subject: "test" } },
  });
  assert.equal((await save()).status, 400);
  assert.equal(await store.read("personal-other.json", null), null);
  const localGet = await fetch(base + "/api/status", {
    headers: {
      "X-Cade-Session": headers["X-Cade-Session"],
      "Sec-Fetch-Site": "same-origin",
    },
  });
  assert.equal(localGet.status, 200);
});

test("HTTP assistant accepts the full catalogue without IDs, streams tools and rejects stale account history", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cade-chat-http-"));
  let active = "account-a";
  const calls = [],
    tokenAccounts = [];
  const app = await createApp({
    store: new Store(dir),
    port: 43121,
    auth: {
      profiles: async () => ({ active }),
      access: async (key) => {
        tokenAccounts.push(key);
        return "fixture";
      },
    },
    askFn: async (auth, input, delta, _fetch, event) => {
      calls.push(input);
      await auth.access();
      event({ status: "Buscando no catálogo", providers: [input.catalog.units[0]] });
      delta("Resultado de toda a rede.");
    },
  });
  await new Promise((r) => app.server.listen(43121, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const headers = { Origin: app.base, "Content-Type": "application/json" };
  const pair = await fetch(app.base + "/api/pair", {
    method: "POST",
    headers,
    body: JSON.stringify({ code: app.pairingCode }),
  });
  headers["X-Cade-Session"] = (await pair.json()).session;
  const post = (body) =>
    fetch(app.base + "/api/ask", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const response = await post({ model: "fixture", question: "Ortodontia" });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(calls[0].scope, "catalog");
  assert.equal(calls[0].catalog.units.length, 690);
  assert.deepEqual(calls[0].ids, []);
  assert.equal(events[0].providers[0].id, calls[0].catalog.units[0].id);
  assert.equal(events.at(-1).done, true);
  assert.deepEqual(tokenAccounts, ["account-a"]);
  const history = [
    { role: "user", content: "Ortodontia" },
    { role: "assistant", content: "Resultados" },
  ];
  active = "account-b";
  assert.equal(
    (await post({ question: "Agora Guará", account: "account-a", history })).status,
    400,
  );
  assert.equal((await post({ question: "Agora Guará", history })).status, 400);
  assert.equal(
    (await post({ question: "Compare", scope: "selected", ids: [] })).status,
    400,
  );
  assert.equal(calls.length, 1);
});
