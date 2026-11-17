import test from "node:test";
import assert from "node:assert/strict";
import { consumeSSE, listModels, ask } from "../src/server/inference.js";
const event = (value) => "data: " + JSON.stringify(value) + "\n\n";
async function* chunks(text, size = 3) {
  const data = new TextEncoder().encode(text);
  for (let i = 0; i < data.length; i += size) yield data.slice(i, i + size);
}
test("SSE handles split UTF-8 packets and requires completed", async () => {
  let output = "";
  const text =
    event({ type: "response.output_text.delta", delta: "Saúde é acesso." }) +
    event({ type: "response.completed" });
  assert.equal(
    await consumeSSE(chunks(text), (s) => (output += s)),
    "Saúde é acesso.",
  );
  assert.equal(output, "Saúde é acesso.");
});
test("partial text followed by a plan limit is a failure, not success", async () => {
  let output = "";
  const text =
    event({ type: "response.output_text.delta", delta: "Parcial" }) +
    event({
      type: "response.failed",
      response: {
        error: { code: "subscription_sharing_usage_limit_exceeded" },
      },
    });
  await assert.rejects(
    consumeSSE(chunks(text), (s) => (output += s)),
    /Limite/,
  );
  assert.equal(output, "Parcial");
});
test("interrupted and incomplete streams fail explicitly", async () => {
  await assert.rejects(
    consumeSSE(
      chunks(event({ type: "response.output_text.delta", delta: "Parcial" })),
    ),
    /antes de concluir/,
  );
  await assert.rejects(
    consumeSSE(chunks(event({ type: "response.incomplete" }))),
    /não foi concluída/,
  );
});
test("account model picker uses models/slug/visibility", async () => {
  const models = await listModels({ access: async () => "fixture" }, async () =>
    Response.json({
      models: [
        { slug: "available", display_name: "Disponível", visibility: "list" },
        { slug: "hidden", visibility: "hidden" },
      ],
    }),
  );
  assert.deepEqual(models, [{ id: "available", name: "Disponível" }]);
});
test("inference posts OAuth token, store false, stream true and only selected public fields", async () => {
  let body;
  const mock = async (url, opts) => {
    assert.equal(opts.headers.Authorization, "Bearer fixture");
    if (url.endsWith("/models"))
      return Response.json({
        models: [
          { slug: "fixture-model", display_name: "Teste", visibility: "list" },
        ],
      });
    body = JSON.parse(opts.body);
    return new Response(event({ type: "response.completed" }));
  };
  await ask(
    { access: async () => "fixture" },
    { model: "fixture-model", question: "Compare", units: [], webSearch: true },
    () => {},
    mock,
  );
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.tools[0].type, "web_search");
  for (const field of [
    "temperature",
    "max_output_tokens",
    "previous_response_id",
  ])
    assert.equal(body[field], undefined);
});
