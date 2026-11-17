import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
const pkg = JSON.parse(await readFile("package.json")),
  index = JSON.parse(await readFile("data/catalog-index.json"));
const lock = JSON.parse(await readFile("package-lock.json"));
let notices = "Third-party dependency notices\n\n";
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || metadata.dev) continue;
  const files = await readdir(path);
  const license = files.find((name) => /^licen[sc]e(?:\..*)?$/i.test(name));
  notices += path + " @ " + metadata.version + "\n";
  notices +=
    (license
      ? await readFile(join(path, license), "utf8")
      : "License: " + (metadata.license ?? "See upstream package")) + "\n\n";
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist/ui", { recursive: true });
await build({
  entryPoints: ["src/ui/app.js", "src/ui/map.js"],
  outdir: "dist/ui",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome116",
  legalComments: "eof",
});
const ext = "dist/chrome-extension",
  companion = "dist/companion",
  plugin = "dist/cade-doutor-plugin";
await cp("extension", ext, { recursive: true });
for (const file of ["index.html", "app.css"])
  await cp("src/ui/" + file, ext + "/" + file);
await cp("dist/ui/app.js", ext + "/app.js");
await cp("data/" + index.current, ext + "/catalog.json");
const nodeBuild = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: {
    js: "import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);",
  },
  legalComments: "eof",
};
await mkdir(companion, { recursive: true });
await cp("src/ui", companion + "/src/ui", { recursive: true });
await cp("dist/ui", companion + "/dist/ui", { recursive: true });
await cp("data", companion + "/data", { recursive: true });
await build({
  ...nodeBuild,
  entryPoints: ["src/server/main.js"],
  outfile: companion + "/server.mjs",
});
await writeFile(
  companion + "/start.mjs",
  "import {start} from './server.mjs';\nimport {dirname} from 'node:path';\nimport {fileURLToPath} from 'node:url';\nawait start({root:dirname(fileURLToPath(import.meta.url))});\n",
);
await mkdir(plugin + "/server", { recursive: true });
await cp("data", plugin + "/data", { recursive: true });
await build({
  ...nodeBuild,
  entryPoints: ["src/server/mcp.js"],
  outfile: plugin + "/server/core.mjs",
});
await writeFile(
  plugin + "/server/mcp.mjs",
  "import {startMcp} from './core.mjs';\nimport {resolve,dirname} from 'node:path';\nimport {fileURLToPath} from 'node:url';\nawait startMcp({root:resolve(dirname(fileURLToPath(import.meta.url)),'..')});\n",
);
await writeFile(
  plugin + "/plugin.json",
  JSON.stringify(
    {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "cade-doutor",
      version: pkg.version,
      description: "Consulte prestadores e seus favoritos locais do Cadê Doutor.",
      author: { name: "Mikaell Araujo" },
      extensions: {
        "com.openai": {
          interface: {
            displayName: "Cadê Doutor",
            shortDescription: "Sua rede de cuidado",
            longDescription:
              "Pesquisa pessoal no catálogo de prestadores, favoritos e histórico de atualização. Requer execução local de Node.js 22 ou superior. Não agenda consultas nem confirma cobertura.",
            developerName: "Mikaell Araujo",
          },
        },
      },
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  plugin + "/mcp.json",
  JSON.stringify(
    {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        "cade-doutor": {
          type: "stdio",
          command: "node",
          args: ["${PLUGIN_ROOT}/server/mcp.mjs"],
          cwd: "${PLUGIN_ROOT}",
        },
      },
    },
    null,
    2,
  ) + "\n",
);
for (const dir of [ext, companion, plugin]) {
  await writeFile(join(dir, "THIRD_PARTY_NOTICES.txt"), notices);
  for (const file of ["LICENSE", "NOTICE.md", "README.md"])
    await cp(file, join(dir, file));
  await cp("docs", join(dir, "docs"), { recursive: true });
  await writeFile(join(dir, "VERSION"), pkg.version + "\n");
}
console.log("Gerados: extensão Chrome, aplicativo local e plugin MCP local.");
