import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
async function walk(dir) {
  const result = [];
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const files = (
  await Promise.all(["src", "scripts", "tests", "extension"].map(walk))
).flat();
for (const file of files.filter((f) => f.endsWith(".js")))
  execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
const manifest = JSON.parse(await readFile("extension/manifest.json")),
  pkg = JSON.parse(await readFile("package.json"));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage", "sidePanel"]);
assert(!manifest.host_permissions.includes("<all_urls>"));
for (const path of (await walk("src/ui")).filter((p) => p.endsWith(".html"))) {
  const text = await readFile(path, "utf8");
  assert(!/<script(?![^>]*src=)[^>]*>/i.test(text), "Inline script: " + path);
  assert(!/\son\w+\s*=/i.test(text), "Inline handler: " + path);
}
for (const file of files) {
  const text = await readFile(file, "utf8");
  assert(
    !/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/.test(text),
    "Possível segredo: " + file,
  );
  assert(
    !/chatgpt\.com\/backend-api/.test(text),
    "Endpoint não permitido: " + file,
  );
}
await import("./validate-catalog.js");
console.log("Sintaxe, manifestos, permissões e catálogo conferidos.");
