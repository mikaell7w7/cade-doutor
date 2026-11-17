import playwright from "playwright";
const { chromium } = playwright;
import { createApp } from "../src/server/main.js";
import { Store } from "../src/server/store.js";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const dir = await mkdtemp("/tmp/cade-ui-");
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) =>
  String(url).startsWith("https://api.openai.com/")
    ? Response.json({
        models: [
          { slug: "fixture", display_name: "Modelo de teste", visibility: "list" },
        ],
      })
    : actualFetch(url, opts);
const auth = {
  profiles: async () => ({ active: "test-account" }),
  status: async () => ({
    active: "test-account",
    accounts: [
      {
        key: "test-account",
        label: "Conta de teste",
        connected: true,
        planEnabled: true,
      },
    ],
  }),
  access: async () => "test-only",
};
let calls = [];
const app = await createApp({
  root: process.cwd(),
  store: new Store(dir),
  auth,
  askFn: async (_a, input, delta, _f, event) => {
    calls.push(input);
    const u = input.catalog.units.find((u) => u.specialties.includes("ORTODONTIA"));
    event({ providers: [u], status: "Catálogo consultado" });
    delta(
      `Encontrei [${u.name}](#prestador=${u.id}) no catálogo.\n\n| Prestador | Região |\n|---|---|\n| ${u.name} | ${u.address} |\n\n` +
        "Informações para comparar os prestadores.\n\n".repeat(25),
    );
  },
});
await new Promise((r) => app.server.listen(43119, "127.0.0.1", r));
await mkdir("ui-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(app.base);
  await page.getByRole("button", { name: "Conexão", exact: true }).click();
  await page.locator("#pair-code").fill(app.pairingCode);
  await page.locator("#pair").click();
  await page.locator("#welcome").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Entendi", exact: true }).click();
  await page.getByRole("button", { name: "Assistente IA", exact: true }).click();
  await page.locator("#question").fill("Ortodontia na Asa Sul");
  await page.locator("#ask").click();
  await page
    .locator(".chat-progress")
    .filter({ hasText: "Pesquisa concluída" })
    .waitFor();
  await page.waitForFunction(() =>
    document.querySelector("#history-state").textContent.includes("salvas neste"),
  );
  await page.locator("#edit-chat").click();
  await page.locator("#chat-title").fill("Dentistas dos filhos");
  await page.locator("#chat-color").selectOption("purple");
  await page.locator("#chat-tags").fill("filhos, ortodontia");
  await page.locator("#chat-editor-form button[type=submit]").click();
  await page
    .locator("#active-chat-title")
    .filter({ hasText: "Dentistas dos filhos" })
    .waitFor();
  const geometry = await page.evaluate(() => {
    const log = document.querySelector("#chat-scroll").getBoundingClientRect(),
      form = document.querySelector("#chat-form").getBoundingClientRect();
    return {
      logBottom: log.bottom,
      formTop: form.top,
      formBottom: form.bottom,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert(geometry.logBottom <= geometry.formTop + 1);
  assert(geometry.formBottom <= geometry.height);
  assert(!geometry.overflow);
  await page.screenshot({ path: "ui-results/desktop.png" });
  await page.reload();
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Dentistas dos filhos" })
    .click();
  await page.locator(".markdown-body table").waitFor();
  assert.equal(
    await page.locator("#active-chat-title").getAttribute("data-color"),
    "purple",
  );
  await page.locator("#question").fill("Quais atendem aos sábados?");
  await page.locator("#ask").click();
  await page
    .locator(".chat-progress")
    .filter({ hasText: "Pesquisa concluída" })
    .last()
    .waitFor();
  assert.equal(calls[1].history[0].content, "Ortodontia na Asa Sul");
  await page.waitForFunction(() =>
    document.querySelector("#history-state").textContent.includes("salvas neste"),
  );
  await page.locator(".provider-link").first().click();
  await page.locator("#new-contact").click();
  await page.locator("#contact-person").fill("Maria");
  await page.locator("#contact-channel").selectOption("WhatsApp");
  await page.locator("#contact-status").selectOption("Aguardando retorno");
  await page
    .locator("#contact-note")
    .fill("Ficou de retornar com horários na sexta-feira.");
  await page.locator("#contact-form button[type=submit]").click();
  await page.locator(".contact-entry").filter({ hasText: "Maria" }).waitFor();
  await page.locator("#provider-dialog .favorite").click();
  await page.waitForFunction(
    () => document.querySelector("#fav-count").textContent === "1",
  );
  await page.locator("#close-provider").click();
  await page.reload();
  await page
    .locator(".chat-list-item")
    .filter({ hasText: "Dentistas dos filhos" })
    .click();
  await page.locator(".provider-link").first().click();
  await page.locator(".contact-entry").filter({ hasText: "Maria" }).waitFor();
  await page
    .locator(".contact-entry button")
    .filter({ hasText: "Retomar conversa" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "ui-results/mobile.png" });
  const mobile = await page.evaluate(() => {
    const log = document.querySelector("#chat-scroll").getBoundingClientRect(),
      form = document.querySelector("#chat-form").getBoundingClientRect();
    return {
      logBottom: log.bottom,
      formTop: form.top,
      formBottom: form.bottom,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert(mobile.logBottom <= mobile.formTop + 1);
  assert(mobile.formBottom <= mobile.height);
  assert(!mobile.overflow);
  await page.locator("#toggle-chats").click();
  await page.locator("#chat-search").fill("ortodontia");
  assert.equal(await page.locator(".chat-list-item").count(), 1);
  await page.locator("#close-chats").click();
  assert(await page.locator("#question").isVisible());
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      success: true,
      desktop: geometry,
      mobile,
      calls: calls.length,
      errors,
    }),
  );
} catch (e) {
  await page.screenshot({ path: "ui-results/error.png" });
  console.log("PAGE_ERRORS", errors);
  console.log("NOTICE", await page.locator("#notice").textContent());
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => app.server.close(r));
  await rm(dir, { recursive: true, force: true });
}
