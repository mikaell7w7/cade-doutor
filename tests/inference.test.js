import test from "node:test";
import assert from "node:assert/strict";
import { consumeSSE, listModels } from "../src/server/inference.js";
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
  assert.equal(await consumeSSE(chunks(text), (s) => (output += s)), "Saúde é acesso.");
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
    consumeSSE(chunks(event({ type: "response.output_text.delta", delta: "Parcial" }))),
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

test("completed with an empty output does not erase streamed tool calls or reasoning", async () => {
  const items = [
    { type: "reasoning", id: "r1", summary: [], encrypted_content: "encrypted-fixture" },
    {
      type: "function_call",
      id: "f1",
      call_id: "c1",
      namespace: "catalog",
      name: "search_catalog",
      arguments: '{"region":"Asa Sul"}',
    },
  ];
  const streamed = items
    .map((item, output_index) =>
      event({ type: "response.output_item.done", output_index, item }),
    )
    .join("");
  for (const snapshot of [[], [items[0]], [items[1]], items]) {
    const wire =
      streamed + event({ type: "response.completed", response: { output: snapshot } });
    let received;
    await consumeSSE(
      chunks(wire),
      () => {},
      (output) => {
        received = output;
      },
    );
    assert.deepEqual(received, items);
  }
});

test("function arguments are accumulated by item and terminal snapshots do not duplicate calls", async () => {
  const call = {
    type: "function_call",
    id: "f1",
    call_id: "c1",
    namespace: "catalog",
    name: "search_catalog",
    arguments: "",
  };
  const wire =
    event({ type: "response.output_item.added", output_index: 1, item: call }) +
    event({
      type: "response.function_call_arguments.delta",
      output_index: 1,
      item_id: "f1",
      delta: '{"region":',
    }) +
    event({
      type: "response.function_call_arguments.delta",
      output_index: 1,
      item_id: "f1",
      delta: '"Asa Sul"}',
    }) +
    event({
      type: "response.function_call_arguments.done",
      output_index: 1,
      item_id: "f1",
      arguments: '{"region":"Asa Sul"}',
    }) +
    event({ type: "response.completed", response: { output: [] } });
  let received;
  await consumeSSE(
    chunks(wire),
    () => {},
    (output) => {
      received = output;
    },
  );
  assert.equal(received.length, 1);
  assert.deepEqual(JSON.parse(received[0].arguments), { region: "Asa Sul" });
  assert.equal(received[0].call_id, "c1");
});

test("final text is recovered without delta events and never duplicated with deltas", async () => {
  const item = {
    type: "message",
    id: "m1",
    role: "assistant",
    content: [{ type: "output_text", text: "Opções na Asa Sul." }],
  };
  for (const prefix of [
    "",
    event({
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      delta: "Opções ",
    }),
    event({
      type: "response.output_text.delta",
      output_index: 0,
      content_index: 0,
      delta: "Opções na Asa Sul.",
    }),
  ]) {
    const wire =
      prefix +
      event({
        type: "response.output_text.done",
        output_index: 0,
        content_index: 0,
        text: "Opções na Asa Sul.",
      }) +
      event({ type: "response.output_item.done", output_index: 0, item }) +
      event({ type: "response.completed", response: { output: [item] } });
    let displayed = "",
      received;
    assert.equal(
      await consumeSSE(
        chunks(wire),
        (s) => {
          displayed += s;
        },
        (items) => {
          received = items;
        },
      ),
      "Opções na Asa Sul.",
    );
    assert.equal(displayed, "Opções na Asa Sul.");
    assert.equal(received.length, 1);
  }
});

test("CRLF split across chunks and a final event without a blank separator are accepted", async () => {
  const wire = (
    event({ type: "response.output_text.delta", delta: "Saúde" }) +
    event({ type: "response.completed", response: { output: [] } })
  )
    .replace(/\n/g, "\r\n")
    .trimEnd();
  assert.equal(await consumeSSE(chunks(wire, 1)), "Saúde");
});

test("a late failure overrides completed and never dispatches collected tool calls", async () => {
  let dispatched = false;
  const wire =
    event({ type: "response.completed", response: { output: [] } }) +
    event({ type: "response.failed" });
  await assert.rejects(
    consumeSSE(
      chunks(wire),
      () => {},
      () => {
        dispatched = true;
      },
    ),
  );
  assert.equal(dispatched, false);
});
