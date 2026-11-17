import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyWorkspace,
  validateWorkspace,
  conversationContext,
} from "../src/core/workspace.js";
import { createApp } from "../src/server/main.js";
import { Store } from "../src/server/store.js";
import { createWorkspace } from "../src/ui/workspace.js";
const date = "2026-11-17T17:00:00.000Z";
const chat = () => ({
  id: "chat-example",
  title: "Ortodontia",
  color: "blue",
  tags: ["Filhos"],
  providerIds: ["unit-example"],
  createdAt: date,
  updatedAt: date,
  draft: "E no sábado?",
  turns: [
    {
      question: "Na Asa Sul?",
      text: "Opções consultadas.",
      state: "completed",
      providerIds: ["unit-example"],
      createdAt: date,
    },
  ],
});
const contact = () => ({
  id: "contact-example",
  providerId: "unit-example",
  providerName: "Clínica",
  providerAddress: "Asa Sul",
  date,
  person: "Maria",
  channel: "Telefone",
  status: "Aguardando retorno",
  note: "Retornar na sexta",
  chatId: "chat-example",
});
test("workspace preserves metadata and contacts, strips unexpected data and rejects malformed backups", () => {
  const original = {
    ...emptyWorkspace(),
    chats: [chat()],
    contacts: [contact()],
    access_token: "never-save",
  };
  const clean = validateWorkspace(original);
  assert.deepEqual(clean.chats[0], chat());
  assert.deepEqual(clean.contacts[0], contact());
  assert.equal(clean.access_token, undefined);
  for (const modify of [
    (d) => (d.chats[0].id = "__proto__"),
    (d) => (d.chats[0].color = "url(evil)"),
    (d) => (d.contacts[0].date = "invalid"),
    (d) => d.chats.push(chat()),
    (d) => (d.chats[0].turns[0].state = "tool"),
    (d) => (d.chats[0].tags = Array(13).fill("tag")),
  ]) {
    const d = structuredClone(original);
    modify(d);
    assert.throws(() => validateWorkspace(d));
  }
});
test("long saved conversations keep all turns but inference uses only complete recent context", () => {
  const turns = Array.from({ length: 30 }, (_, i) => ({
    ...chat().turns[0],
    question: "Pergunta " + i,
  }));
  turns.push({ ...chat().turns[0], state: "failed", text: "partial-secret" });
  const c = conversationContext(turns, "Continue");
  assert.equal(c.history.length, 40);
  assert.equal(c.omitted, 10);
  assert.equal(c.history[0].content, "Pergunta 10");
  assert(!JSON.stringify(c).includes("partial-secret"));
  assert.equal(turns.length, 31);
  assert.equal(
    conversationContext([{ ...turns[0], text: "x".repeat(31000) }], "Continue").history
      .length,
    0,
  );
});
test("workspace HTTP persists on disk, isolates accounts and rejects stale writes and paths", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "cade-workspace-")),
    store = new Store(dir);
  let active = "account-one";
  const app = await createApp({
    store,
    port: 43122,
    auth: { profiles: async () => ({ active }) },
  });
  await new Promise((r) => app.server.listen(43122, "127.0.0.1", r));
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
  const read = async () => (await fetch(app.base + "/api/workspace", { headers })).json();
  const write = (d) =>
    fetch(app.base + "/api/workspace", {
      method: "PUT",
      headers,
      body: JSON.stringify(d),
    });
  const initial = await read();
  initial.chats.push(chat());
  initial.contacts.push(contact());
  const res = await write(initial);
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual((await new Store(dir).read("workspace-account-one.json")).chats, [
    chat(),
  ]);
  assert.equal((await write(initial)).status, 400);
  assert.equal((await write({ ...saved, profile: "../../other.json" })).status, 400);
  active = "account-two";
  assert.deepEqual((await read()).chats, []);
  assert.equal((await write(saved)).status, 400);
  active = "account-one";
  assert.equal((await read()).contacts[0].person, "Maria");
});
test("client serializes chat/contact updates and retains an exportable conflicting copy", async () => {
  let db = { ...emptyWorkspace(), profile: "workspace-account-one.json" };
  const client = createWorkspace({
    notice: () => {},
    api: async (_path, data) => {
      if (!data) return structuredClone(db);
      assert.equal(data.revision, db.revision);
      db = { ...structuredClone(data), revision: db.revision + 1 };
      return structuredClone(db);
    },
  });
  await client.load();
  await Promise.all([
    client.update((d) => d.chats.push(chat())),
    client.update((d) => d.contacts.push(contact())),
  ]);
  assert.equal(db.chats.length, 1);
  assert.equal(db.contacts.length, 1);
  assert.equal(db.revision, 2);
  db.revision++;
  await assert.rejects(client.update((d) => (d.chats[0].title = "Pending rename")));
  assert(client.dirty());
  assert.equal(client.get().chats[0].title, "Pending rename");
  await assert.rejects(client.load(), /não salvas/);
  client.discardPending();
  await client.load();
  assert.equal(client.get().chats[0].title, "Ortodontia");
});
test("organization and contact follow-up survive backups without altering old schemas", () => {
  const d = {
    ...emptyWorkspace(),
    chats: [
      {
        ...chat(),
        archived: true,
        pinned: true,
        scope: "selected",
        selection: ["unit-example"],
      },
    ],
    contacts: [
      {
        ...contact(),
        professional: "Dra. Ana",
        nextStep: "Confirmar agenda",
        returnAt: date,
      },
    ],
  };
  const clean = validateWorkspace(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(clean, d);
  for (const modify of [
    (d) => (d.chats[0].archived = "false"),
    (d) => (d.chats[0].scope = "all-secret"),
    (d) => (d.chats[0].selection = ["__proto__"]),
    (d) => (d.contacts[0].returnAt = "amanhã"),
    (d) => (d.contacts[0].nextStep = "x".repeat(1001)),
  ]) {
    const invalid = structuredClone(d);
    modify(invalid);
    assert.throws(() => validateWorkspace(invalid));
  }
  assert(
    !JSON.stringify(conversationContext(clean.chats[0].turns, "Continue")).includes(
      "Dra. Ana",
    ),
  );
});
