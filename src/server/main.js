#!/usr/bin/env node
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store } from "./store.js";
import { Auth } from "./auth.js";
import { ask, listModels, resolveScope } from "./inference.js";
import { loadCatalog, replaceCatalog, bundledCatalog } from "./catalog-store.js";
import { validatePersonal } from "../core/catalog.js";
import { Maps } from "./maps.js";

export function validOrigin(origin, base) {
  return origin === base || /^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? "");
}
export function constantEqual(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export async function readJSON(req, max = 3_000_000) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new Error("Arquivo muito grande.");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function createApp({
  root = process.env.CADE_DOUTOR_ROOT ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  store = new Store(),
  port = 43119,
  auth = new Auth(store),
  askFn = ask,
  maps = new Maps(process.env.GOOGLE_MAPS_SERVER_KEY),
} = {}) {
  const base = "http://127.0.0.1:" + port,
    sessions = new Map(),
    inflight = new Set();
  let pairingCode = randomBytes(12).toString("hex"),
    pairingExpires = Date.now() + 15 * 60_000,
    attempts = 0;
  const personalPath = async () => {
    const p = await auth.profiles();
    return "personal-" + (p.active ?? "local") + ".json";
  };
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== "127.0.0.1:" + port) {
        json(res, 403, { error: "Host não permitido." });
        return;
      }
      const u = new URL(req.url, base),
        origin =
          req.headers.origin ??
          (req.headers["sec-fetch-site"] === "same-origin" ? base : undefined);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (origin) {
        if (!validOrigin(origin, base)) {
          json(res, 403, { error: "Origem não permitida." });
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, PUT",
          "Access-Control-Allow-Headers": "Content-Type, X-Cade-Session",
        });
        res.end();
        return;
      }
      if (u.pathname === "/auth/callback") {
        if (req.method !== "GET") {
          json(res, 405, {});
          return;
        }
        try {
          await auth.callback(u.searchParams);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          });
          res.end(
            "<h1>Conta conectada</h1><p>Volte ao Cadê Doutor e clique em Atualizar conexão.</p>",
          );
        } catch (e) {
          json(res, 400, { error: e.message });
        }
        return;
      }
      if (u.pathname === "/api/health") {
        json(res, 200, { name: "Cadê Doutor", version: "0.2.0" });
        return;
      }
      if (u.pathname === "/api/pair" && req.method === "POST") {
        if (!origin || req.headers["content-type"] !== "application/json") {
          json(res, 403, {});
          return;
        }
        const body = await readJSON(req, 1000);
        attempts++;
        if (
          attempts > 10 ||
          Date.now() > pairingExpires ||
          !constantEqual(body.code, pairingCode)
        ) {
          json(res, 403, {
            error: "Código inválido ou expirado. Reinicie o serviço para gerar outro.",
          });
          return;
        }
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, { origin });
        json(res, 200, { session: token });
        return;
      }
      if (u.pathname.startsWith("/api/")) {
        const session = sessions.get(req.headers["x-cade-session"]);
        if (!session || session.origin !== origin) {
          json(res, 401, { error: "Conecte este navegador ao serviço local." });
          return;
        }
        if (req.method !== "GET" && req.headers["content-type"] !== "application/json") {
          json(res, 415, { error: "Envie JSON." });
          return;
        }
        if (u.pathname === "/api/status" && req.method === "GET") {
          json(res, 200, {
            ...(await auth.status()),
            mapsConfigured: !!maps.key,
            mapBrowserConfigured: !!process.env.GOOGLE_MAPS_BROWSER_KEY,
          });
          return;
        }
        if (u.pathname === "/api/auth/start" && req.method === "POST") {
          const b = await readJSON(req, 1000);
          json(res, 200, {
            url: await auth.start(base + "/auth/callback", b.account),
          });
          return;
        }
        if (u.pathname === "/api/auth/select" && req.method === "POST") {
          const b = await readJSON(req, 1000);
          for (const controller of inflight) controller.abort();
          await auth.select(b.account);
          json(res, 200, await auth.status());
          return;
        }
        if (u.pathname === "/api/auth/logout" && req.method === "POST") {
          const b = await readJSON(req, 1000);
          for (const controller of inflight) controller.abort();
          json(res, 200, await auth.logout(b.account));
          return;
        }
        if (u.pathname === "/api/models" && req.method === "GET") {
          json(res, 200, await listModels(auth));
          return;
        }
        if (u.pathname === "/api/catalog" && req.method === "GET") {
          json(res, 200, await loadCatalog(root, store));
          return;
        }
        if (u.pathname === "/api/catalog" && req.method === "PUT") {
          json(res, 200, await replaceCatalog(root, store, await readJSON(req)));
          return;
        }
        if (u.pathname === "/api/history" && req.method === "GET") {
          json(res, 200, await store.read("catalog-history.json", []));
          return;
        }
        if (u.pathname === "/api/personal" && req.method === "GET") {
          const path = await personalPath();
          json(res, 200, {
            ...(await store.read(path, { schemaVersion: 1, favorites: {} })),
            profile: path,
          });
          return;
        }
        if (u.pathname === "/api/personal" && req.method === "PUT") {
          // Client sends the whole profile with a revision to avoid silent lost updates.
          const body = await readJSON(req);
          validatePersonal(body);
          const path = await personalPath();
          let result;
          await store.transaction(async () => {
            if (body.profile !== path || (await personalPath()) !== path)
              throw new Error("O perfil mudou. Atualize a conexão antes de salvar.");
            const current = await store.read(path, {
              schemaVersion: 1,
              favorites: {},
              revision: 0,
            });
            if ((body.revision ?? 0) !== (current.revision ?? 0))
              throw new Error(
                "Dados alterados em outra janela. Atualize a conexão antes de salvar.",
              );
            result = {
              schemaVersion: 1,
              favorites: body.favorites,
              revision: (current.revision ?? 0) + 1,
            };
            await store.write(path, result);
            result.profile = path;
          });
          json(res, 200, result);
          return;
        }
        if (u.pathname === "/api/geocode" && req.method === "POST") {
          const b = await readJSON(req, 2000);
          json(res, 200, await maps.geocode(b.address));
          return;
        }
        if (u.pathname === "/api/place" && req.method === "POST") {
          const b = await readJSON(req, 1000),
            c = await loadCatalog(root, store),
            unit = c.units.find((x) => x.id === b.id);
          if (!unit) throw new Error("Unidade não encontrada.");
          json(res, 200, await maps.place(unit.name + " " + unit.address));
          return;
        }
        if (u.pathname === "/api/route" && req.method === "POST") {
          const b = await readJSON(req, 2000);
          json(res, 200, await maps.route(b.origin, b.destination));
          return;
        }
        if (u.pathname === "/api/map-key" && req.method === "GET") {
          json(res, 200, { key: process.env.GOOGLE_MAPS_BROWSER_KEY ?? "" });
          return;
        }
        if (u.pathname === "/api/ask" && req.method === "POST") {
          const b = await readJSON(req, 180000),
            c = await loadCatalog(root, store);
          const accountKey = (await auth.profiles()).active;
          if (!accountKey) throw new Error("Selecione uma conta ChatGPT.");
          if (b.account !== undefined && b.account !== accountKey)
            throw new Error(
              "A conta mudou. Atualize a conexão e inicie uma nova conversa.",
            );
          if (b.history?.length && b.account !== accountKey)
            throw new Error("Confirme a conta antes de continuar a conversa.");
          resolveScope(c, b.scope ?? "catalog", b.ids ?? []);
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
          });
          const controller = new AbortController();
          inflight.add(controller);
          res.on("close", () => controller.abort());
          try {
            await askFn(
              { access: () => auth.access(accountKey) },
              {
                model: b.model,
                question: b.question,
                catalog: c,
                scope: b.scope ?? "catalog",
                ids: b.ids ?? [],
                history: b.history ?? [],
                webSearch: b.webSearch === true,
                signal: controller.signal,
              },
              (delta) => res.write(JSON.stringify({ delta }) + "\n"),
              undefined,
              (event) => res.write(JSON.stringify(event) + "\n"),
            );
            res.end(JSON.stringify({ done: true }) + "\n");
          } catch (e) {
            res.end(
              JSON.stringify({
                error: controller.signal.aborted ? "Consulta interrompida." : e.message,
              }) + "\n",
            );
          } finally {
            inflight.delete(controller);
          }
          return;
        }
        json(res, 404, { error: "Recurso não encontrado." });
        return;
      }
      if (req.method !== "GET") {
        json(res, 405, {});
        return;
      }
      if (u.pathname === "/catalog.json") {
        json(res, 200, await bundledCatalog(root));
        return;
      }
      const files = {
        "/": "src/ui/index.html",
        "/app.js": "dist/ui/app.js",
        "/app.css": "src/ui/app.css",
        "/catalog.json": "data/snapshots/tst-saude-2026-11-17.json",
        "/map.html": "src/ui/map.html",
        "/map.js": "dist/ui/map.js",
      };
      const file = files[u.pathname];
      if (!file) {
        json(res, 404, { error: "Não encontrado." });
        return;
      }
      // Maps browser keys use referrer restrictions. Keep OAuth callbacks private.
      if (u.pathname === "/map.html") res.setHeader("Referrer-Policy", "origin");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' https://maps.googleapis.com https://maps.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com; connect-src 'self' https://raw.githubusercontent.com https://*.googleapis.com https://*.gstatic.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".json")
              ? "application/json"
              : "text/javascript",
      );
      res.end(await readFile(join(root, file)));
    } catch (e) {
      if (!res.headersSent) json(res, 400, { error: e.message });
      else res.end();
    }
  });
  return { server, base, pairingCode, store };
}

export async function start(options) {
  const app = await createApp(options);
  await app.store.lock();
  app.server.on("error", async (e) => {
    await app.store.unlock();
    console.error("Não foi possível iniciar o serviço: " + e.code);
    process.exit(1);
  });
  app.server.listen(43119, "127.0.0.1", () => {
    console.log(
      "Cadê Doutor: " +
        app.base +
        "\nCódigo de conexão (15 minutos): " +
        app.pairingCode +
        "\nUse somente no seu navegador ou na extensão Cadê Doutor.",
    );
  });
  const stop = () =>
    app.server.close(async () => {
      await app.store.unlock();
      process.exit(0);
    });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await start();
