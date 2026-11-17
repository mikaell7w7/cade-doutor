import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { createAssistant } from "../src/ui/chat.js";
test("conversation submits without selection, renders results and reuses completed history", async (t) => {
  const html = await readFile(new URL("../src/ui/index.html", import.meta.url), "utf8"),
    { document, window } = parseHTML(html);
  const original = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  Object.assign(globalThis, {
    document,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: clearTimeout,
  });
  t.after(() => Object.assign(globalThis, original));
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // The DOM fixture has no browser select-value setter; provide the standard form values.
  for (const [id, value] of [
    ["model", "fixture"],
    ["scope", "catalog"],
  ])
    Object.defineProperty(document.getElementById(id), "value", {
      value,
      writable: true,
      configurable: true,
    });
  const requests = [],
    unit = {
      id: "tst-example",
      name: "Clínica Exemplo",
      address: "Guará",
      types: ["dental"],
      specialties: ["ORTODONTIA"],
      phones: [],
      sites: [],
    };
  globalThis.fetch = async (url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(
      [
        {
          status: "Ortodontia: 1 unidade encontrada.",
          search: { total: 1, offset: 0, nextOffset: null },
          providers: [unit],
        },
        {
          delta: "**Resultado**\n\n| Clínica | Região |\n|---|---|\n| Exemplo | Guará |",
        },
        { done: true },
      ]
        .map((e) => JSON.stringify(e) + "\n")
        .join(""),
    );
  };
  const chat = createAssistant({
    base: "http://local",
    getSession: () => "local-session",
    getAccount: () => "account-a",
    getCatalog: () => ({ units: [unit] }),
    getSelected: () => new Set(),
    renderCard: (u) => {
      const card = document.createElement("article");
      card.textContent = u.name;
      return card;
    },
    openProvider: () => {},
    notice: () => {},
  });
  document.getElementById("question").value = "Quais têm ortodontia?";
  await chat.submit();
  assert.equal(requests[0].scope, "catalog");
  assert.deepEqual(requests[0].ids, []);
  assert.deepEqual(requests[0].history, []);
  assert.equal(document.querySelectorAll(".markdown-body table").length, 1);
  assert.match(document.querySelector(".chat-providers").textContent, /Clínica Exemplo/);
  document.getElementById("question").value = "Somente no Guará";
  await chat.submit();
  assert.equal(requests[1].history[0].content, "Quais têm ortodontia?");
  assert.equal(requests[1].history[1].role, "assistant");
  assert.equal(document.querySelectorAll(".chat-user").length, 2);

  const successfulFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ delta: "Parcial" }) + "\n");
  document.getElementById("question").value = "Uma consulta interrompida";
  await chat.submit();
  assert.match(document.querySelector(".chat-error").textContent, /interrompida/);
  assert.equal(document.getElementById("ask").disabled, false);
  globalThis.fetch = successfulFetch;
  document.getElementById("question").value = "Continue com os resultados completos";
  await chat.submit();
  assert.equal(requests[2].history.length, 4);
  assert(!requests[2].history.some((m) => m.content.includes("Parcial")));

  let finish;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          finish = () => controller.close();
        },
      }),
    );
  document.getElementById("question").value = "Demorada";
  const pending = chat.submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A late completion from the previous account must not overwrite the new conversation.
  chat.resetForAccount("account-b");
  finish();
  await pending;
  assert.equal(document.querySelectorAll(".chat-user").length, 0);
  assert.equal(document.getElementById("ask").disabled, false);
  assert.match(document.getElementById("chat-status").textContent, /Conversa nova/);
});
