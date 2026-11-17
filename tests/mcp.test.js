import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("packaged MCP starts, lists read-only tools and searches the actual catalogue", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "cade-mcp-"));
  const client = new Client({ name: "cade-test", version: "1.0" }),
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cade-doutor-plugin/server/mcp.mjs")],
      env: { PATH: process.env.PATH, CADE_DOUTOR_HOME: home },
      stderr: "pipe",
    });
  t.after(async () => {
    await client.close();
    await rm(home, { recursive: true, force: true });
  });
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 4);
  assert(tools.tools.every((t) => t.annotations.readOnlyHint));
  const result = await client.callTool({
      name: "search_providers",
      arguments: { type: "dental", limit: 3 },
    }),
    data = JSON.parse(result.content[0].text);
  assert.equal(data.total, 142);
  assert.equal(data.units.length, 3);
  const favorites = await client.callTool({
    name: "list_favorites",
    arguments: {},
  });
  assert.deepEqual(JSON.parse(favorites.content[0].text).favorites, []);
});
