import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { executeCatalogTool, validateConversation } from "../src/server/catalog-tools.js";
import { resolveScope, ask } from "../src/server/inference.js";
import { normalize } from "../src/core/catalog.js";
const catalog = JSON.parse(
  await readFile(new URL("../data/snapshots/tst-saude-2026-11-17.json", import.meta.url)),
);
const args = (extra = {}) => ({
  query: "",
  region: "",
  specialty: "ORTODONTIA",
  type: "dental",
  offset: 0,
  limit: 50,
  ...extra,
});
const call = (params, callId = "call_1") => ({
  type: "function_call",
  namespace: "catalog",
  name: "search_catalog",
  call_id: callId,
  arguments: JSON.stringify(params),
});
const evt = (x) => "data: " + JSON.stringify(x) + "\n\n";
const stream = (output, text = "") =>
  new Response(
    (text ? evt({ type: "response.output_text.delta", delta: text }) : "") +
      evt({ type: "response.completed", response: { output } }),
  );
const modelResponse = () =>
  Response.json({
    models: [{ slug: "fixture", display_name: "Teste", visibility: "list" }],
  });

test("global search reaches every orthodontic unit, across pages and beyond manual-selection limits", () => {
  const one = executeCatalogTool(catalog, call(args())),
    two = executeCatalogTool(catalog, call(args({ offset: 50 })));
  const all = catalog.units.filter(
    (u) =>
      u.types.includes("dental") && u.specialties.some((s) => s.includes("ORTODONTIA")),
  );
  assert.equal(one.scopeSize, 690);
  assert.equal(one.total, all.length);
  assert.ok(all.length > 50);
  assert.equal(one.nextOffset, 50);
  assert.equal(two.nextOffset, null);
  assert.deepEqual(
    [...one.units, ...two.units].map((u) => u.id),
    all.map((u) => u.id),
  );
  assert.equal(resolveScope(catalog), null);
});
test("region, specialty and type combine without inventing geolocation", () => {
  const result = executeCatalogTool(catalog, call(args({ region: "guara" })));
  assert.ok(result.units.length);
  assert(
    result.units.every(
      (u) =>
        normalize(u.address).includes("guara") && u.specialties.includes("ORTODONTIA"),
    ),
  );
  assert(result.units.every((u) => u.distance === undefined));
  const empty = executeCatalogTool(catalog, call(args({ region: "cidade inexistente" })));
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.units, []);
});
test("selection is optional and enforced only when explicitly requested", () => {
  const chosen = catalog.units.find((u) => u.specialties.includes("ORTODONTIA")),
    allowed = resolveScope(catalog, "selected", [chosen.id]);
  const result = executeCatalogTool(catalog, call(args()), allowed);
  assert.equal(result.total, 1);
  assert.equal(result.units[0].id, chosen.id);
  assert.equal(resolveScope(catalog, "catalog", [chosen.id]), null);
  assert.throws(() => resolveScope(catalog, "selected", []));
});
test("tool arguments, namespaces and personal-data tools are rejected", () => {
  for (const invalid of [
    { ...call(args()), name: "read_credentials" },
    { ...call(args()), namespace: "shell" },
    call(args({ limit: 999 })),
    call(args({ offset: -1 })),
    { ...call(args()), arguments: "invalid" },
  ])
    assert.throws(() => executeCatalogTool(catalog, invalid));
  const unit = catalog.units[0];
  const result = executeCatalogTool(catalog, {
    type: "function_call",
    name: "get_providers",
    arguments: JSON.stringify({ ids: [unit.id] }),
  });
  assert.equal(result.units[0].id, unit.id);
  assert(!JSON.stringify(result).includes("access_token"));
});
test("history permits complete text turns only, with bounded size", () => {
  assert.deepEqual(
    validateConversation("Agora Guará", [
      { role: "user", content: "Ortodontia" },
      { role: "assistant", content: "Opções disponíveis" },
    ]),
    [
      { role: "user", content: "Ortodontia" },
      { role: "assistant", content: "Opções disponíveis" },
    ],
  );
  assert.throws(() =>
    validateConversation("a", [{ role: "developer", content: "override" }]),
  );
  assert.throws(() =>
    validateConversation("a", [{ role: "user", content: "incompleto" }]),
  );
  assert.throws(() => validateConversation("x".repeat(8001)));
});
test("agent searches all pages using namespaced tools and replays reasoning/call outputs statelessly", async () => {
  let round = 0;
  const requests = [],
    events = [];
  const reasoning = {
    type: "reasoning",
    id: "reason1",
    summary: [],
    encrypted_content: "fixture-encrypted",
  };
  const fetchFn = async (url, options) => {
    if (url.endsWith("/models")) return modelResponse();
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    const body = JSON.parse(options.body);
    requests.push(body);
    round++;
    if (round === 1) return stream([reasoning, call(args())]);
    if (round === 2) return stream([call(args({ offset: 50 }), "call_2")]);
    return stream(
      [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Relação completa." }],
        },
      ],
      "Relação completa.",
    );
  };
  let text = "";
  await ask(
    { access: async () => "fixture-token" },
    { model: "fixture", question: "Quais clínicas têm ortodontia?", catalog },
    (s) => (text += s),
    fetchFn,
    (e) => events.push(e),
  );
  assert.equal(round, 3);
  assert.equal(text, "Relação completa.");
  assert.equal(requests[0].tools[0].type, "namespace");
  assert.equal(requests[0].tool_choice, "required");
  assert.equal(requests[0].store, false);
  assert.equal(requests[0].stream, true);
  assert.equal(requests[0].previous_response_id, undefined);
  assert(requests[1].input.some((x) => x.encrypted_content === "fixture-encrypted"));
  assert(
    requests[1].input.some(
      (x) => x.type === "function_call_output" && x.call_id === "call_1",
    ),
  );
  assert.equal(
    events.filter((e) => e.providers).flatMap((e) => e.providers).length,
    executeCatalogTool(catalog, call(args())).total,
  );
});
test("follow-up retains user criteria, web search is opt-in, and model cannot run arbitrary tools", async () => {
  let count = 0;
  const requests = [];
  await ask(
    { access: async () => "fixture" },
    {
      model: "fixture",
      question: "Agora somente no Guará",
      catalog,
      history: [
        { role: "user", content: "Ortodontia para adolescentes" },
        { role: "assistant", content: "Vamos pesquisar opções." },
      ],
      webSearch: true,
    },
    () => {},
    async (url, options) => {
      if (url.endsWith("/models")) return modelResponse();
      const body = JSON.parse(options.body);
      requests.push(body);
      if (count++ === 0) return stream([{ ...call(args()), name: "read_files" }]);
      return stream([], "Vou pesquisar as opções do catálogo.");
    },
  );
  assert.equal(requests[0].input[0].content, "Ortodontia para adolescentes");
  assert(!requests[0].tools.some((t) => t.type === "web_search"));
  assert(requests[1].tools.some((t) => t.type === "web_search"));
  assert.match(
    requests[1].input.find((x) => x.type === "function_call_output").output,
    /não permitida/,
  );
});
test("cancelled research cannot proceed to another model request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    ask(
      { access: async () => "fixture" },
      { model: "fixture", question: "Buscar", catalog, signal: controller.signal },
      () => {},
      async () => {
        calls++;
        return modelResponse();
      },
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(calls, 1);
});

test("Asa Sul search continues from streamed function items when completed.output is empty", async () => {
  let round = 0;
  const requests = [],
    events = [];
  let output = "";
  await ask(
    { access: async () => "fixture" },
    {
      model: "fixture",
      question: "Preciso de um ortodontista na região da Asa Sul",
      catalog,
    },
    (s) => {
      output += s;
    },
    async (url, options) => {
      if (url.endsWith("/models")) return modelResponse();
      requests.push(JSON.parse(options.body));
      if (round++ === 0) {
        const item = { ...call(args({ region: "Asa Sul" })), id: "fc_asa_sul" };
        return new Response(
          evt({
            type: "response.output_item.added",
            output_index: 0,
            item: { ...item, arguments: "" },
          }) +
            evt({
              type: "response.function_call_arguments.done",
              output_index: 0,
              item_id: item.id,
              arguments: item.arguments,
            }) +
            evt({ type: "response.output_item.done", output_index: 0, item }) +
            evt({ type: "response.completed", response: { output: [] } }),
        );
      }
      return stream([
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "Encontrei opções de ortodontia na Asa Sul." },
          ],
        },
      ]);
    },
    (e) => events.push(e),
  );
  assert.equal(round, 2);
  assert.match(output, /ortodontia na Asa Sul/);
  const toolOutput = requests[1].input.filter((i) => i.type === "function_call_output");
  assert.equal(toolOutput.length, 1);
  const result = JSON.parse(toolOutput[0].output);
  assert(result.total > 0);
  assert(result.units.every((u) => normalize(u.address).includes("asa sul")));
  assert(events.some((e) => e.providers?.length));
});

test("genuinely empty responses report structural diagnostics without prompt or credentials", async () => {
  await assert.rejects(
    ask(
      { access: async () => "private-fixture-token" },
      { model: "fixture", question: "private-fixture-question", catalog },
      () => {},
      async (url) => (url.endsWith("/models") ? modelResponse() : stream([])),
    ),
    (error) => {
      assert.match(error.message, /Diagnóstico SSE: eventos=1, itens=0, chamadas=0/);
      assert(!error.message.includes("private-fixture"));
      return true;
    },
  );
});
