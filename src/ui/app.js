import {
  searchUnits,
  validateCatalog,
  compareCatalogs,
  favoriteRows,
  validatePersonal,
  normalize,
} from "../core/catalog.js";
const $ = (s) => document.querySelector(s),
  base = "http://127.0.0.1:43119",
  ext = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const storage = {
  async get(k) {
    return ext
      ? (await chrome.storage.local.get(k))[k]
      : JSON.parse(localStorage.getItem(k) || "null");
  },
  async set(k, v) {
    if (ext) await chrome.storage.local.set({ [k]: v });
    else localStorage.setItem(k, JSON.stringify(v));
  },
};
let session = ext
    ? (await chrome.storage.session.get("session")).session
    : sessionStorage.getItem("cade-session"),
  catalog,
  personal = { schemaVersion: 1, favorites: {} },
  selected = new Set(),
  pageSize = 24,
  connected = false,
  status = {},
  aborter;
const notice = (t) => {
  $("#notice").textContent = t;
};
const action =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notice(e.message);
    }
  };
function tab(name) {
  for (const p of document.querySelectorAll(".pane")) p.hidden = p.id !== name;
  for (const b of document.querySelectorAll("nav button"))
    b.classList.toggle("active", b.dataset.tab === name);
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
async function api(path, body, method = body ? "POST" : "GET") {
  if (!session) throw new Error("Abra Conexão e conecte o serviço local.");
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Cade-Session": session },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Não foi possível concluir.");
  return d;
}
function download(name, data) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
async function savePersonal(next) {
  validatePersonal(next);
  if (connected) personal = await api("personal", next, "PUT");
  else {
    await storage.set("personal", next);
    personal = next;
  }
  render();
}
function button(text, fn, className = "secondary") {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = className;
  b.onclick = action(fn);
  return b;
}
function link(text, href) {
  const a = document.createElement("a");
  a.textContent = text;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
function showEditor(u) {
  $("#edit-title").textContent = u.name;
  $("#edit-list").value = personal.favorites[u.id]?.list ?? "";
  $("#edit-note").value = personal.favorites[u.id]?.note ?? "";
  $("#edit-dialog").showModal();
  $("#save-note").onclick = action(async (e) => {
    e.preventDefault();
    const next = structuredClone(personal);
    next.favorites[u.id] = {
      ...next.favorites[u.id],
      snapshot: u,
      savedAt: next.favorites[u.id]?.savedAt ?? new Date().toISOString(),
      list: $("#edit-list").value,
      note: $("#edit-note").value,
    };
    await savePersonal(next);
    $("#edit-dialog").close();
  });
}
function card(u, missing = false) {
  const el = document.createElement("article");
  el.className = "card";
  const tags = document.createElement("div");
  tags.className = "tags";
  for (const t of u.types) {
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent =
      { dental: "Odontológico", medical: "Médico", hospital: "Hospital" }[t] ??
      t;
    tags.append(s);
  }
  if (missing) {
    const s = document.createElement("span");
    s.className = "tag alert";
    s.textContent = "Não localizado na última coleta";
    tags.append(s);
  }
  const h = document.createElement("h3");
  h.textContent = u.name;
  const address = document.createElement("p");
  address.className = "address";
  address.textContent = u.address;
  const details = document.createElement("details"),
    summary = document.createElement("summary"),
    p = document.createElement("p");
  summary.textContent = u.specialties.length + " especialidade(s)";
  p.textContent = u.specialties.join(" · ");
  details.append(summary, p);
  const phone = document.createElement("p");
  phone.textContent = u.phones.join(" / ");
  const links = document.createElement("div");
  links.append(
    link(
      "Pesquisar no Google Maps ↗",
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(u.name + " " + u.address),
    ),
  );
  const actions = document.createElement("div");
  actions.className = "actions";
  const saved = !!personal.favorites[u.id];
  actions.append(
    button(
      saved ? "♥ Favorito" : "♡ Favoritar",
      async () => {
        const next = structuredClone(personal);
        if (next.favorites[u.id]) delete next.favorites[u.id];
        else
          next.favorites[u.id] = {
            snapshot: u,
            savedAt: new Date().toISOString(),
            note: "",
            list: "",
          };
        await savePersonal(next);
      },
      "favorite " + (saved ? "saved" : ""),
    ),
  );
  if (!missing)
    actions.append(
      button(selected.has(u.id) ? "✓ Selecionado" : "Comparar", () => {
        if (selected.has(u.id)) selected.delete(u.id);
        else {
          if (selected.size >= 30)
            throw new Error("Selecione até 30 prestadores.");
          selected.add(u.id);
        }
        render();
      }),
    );
  if (saved) actions.append(button("Anotar", () => showEditor(u)));
  el.append(tags, h, address, details, phone, links);
  const f = personal.favorites[u.id];
  if (f?.list || f?.note) {
    const n = document.createElement("p");
    n.className = "muted";
    n.textContent = [f.list, f.note].filter(Boolean).join(": ");
    el.append(n);
  }
  el.append(actions);
  return el;
}
function render() {
  if (!catalog) return;
  const units = searchUnits(catalog, {
    query: $("#query").value,
    specialty: $("#specialty").value,
    type: $("#type").value,
  });
  $("#result-count").textContent = units.length + " unidades encontradas";
  $("#source-label").textContent =
    catalog.source.name +
    " · " +
    catalog.units.length +
    " unidades · coleta " +
    catalog.collectedAt;
  $("#catalog-info").textContent =
    catalog.categories.length +
    " categorias conferidas. Atualização: " +
    catalog.collectedAt +
    ".";
  $("#results").replaceChildren(
    ...units.slice(0, pageSize).map((u) => card(u)),
  );
  $("#more").hidden = units.length <= pageSize;
  const fav = favoriteRows(catalog, personal.favorites).filter((f) =>
    normalize([f.unit.name, f.note, f.list].join(" ")).includes(
      normalize($("#favorite-query").value),
    ),
  );
  $("#favorite-results").replaceChildren(
    ...fav.map((f) => card(f.unit, f.status === "not_found")),
  );
  if (!fav.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent =
      "Salve seus prestadores para comparar e acompanhar mudanças.";
    $("#favorite-results").append(p);
  }
  $("#fav-count").textContent = Object.keys(personal.favorites).length;
  $("#selection").replaceChildren(
    ...[...selected].map((id) => {
      const u = catalog.units.find((u) => u.id === id);
      return button((u?.name ?? id) + " ×", () => {
        selected.delete(id);
        render();
      });
    }),
  );
  if (!selected.size)
    $("#selection").textContent =
      "Selecione prestadores em Explorar para comparar.";
}
function setCatalog(c) {
  catalog = validateCatalog(c);
  const current = $("#specialty").value;
  $("#specialty").replaceChildren(
    new Option("Todas as especialidades", ""),
    ...catalog.categories
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((s) => new Option(s, s)),
  );
  $("#specialty").value = current;
  selected = new Set(
    [...selected].filter((id) => catalog.units.some((u) => u.id === id)),
  );
  render();
}
for (const selector of ["#query", "#type", "#specialty", "#favorite-query"])
  $(selector).addEventListener("input", () => {
    pageSize = 24;
    render();
  });
$("#more").onclick = () => {
  pageSize += 24;
  render();
};
async function refresh() {
  status = await api("status");
  connected = true;
  $("#connection-state").textContent = "Conectado ao serviço local";
  $("#account").replaceChildren(
    new Option("Adicionar outra conta", ""),
    ...status.accounts.map((a) => new Option(a.label, a.key)),
  );
  $("#account").value = status.active ?? "";
  const active = status.accounts.find((a) => a.key === status.active);
  $("#account-state").textContent = active
    ? active.label + (active.connected ? " · conectada" : " · entre novamente")
    : "Nenhuma conta selecionada";
  $("#plan-indicator").textContent =
    active?.connected && active?.planEnabled
      ? "Usando plano do ChatGPT"
      : "Autorize o uso do plano na aba Conexão.";
  personal = validatePersonal(await api("personal"));
  setCatalog(await api("catalog"));
  $("#history").textContent = (await api("history"))
    .slice(-3)
    .map(
      (d) =>
        `${d.to}: ${d.added.length} novas, ${d.changed.length} alteradas, ${d.missing.length} não localizadas.`,
    )
    .join("\n");
  $("#model").replaceChildren(
    new Option("Conecte sua conta para carregar", ""),
  );
  if (active?.connected && active.planEnabled) {
    const models = await api("models");
    $("#model").replaceChildren(...models.map((m) => new Option(m.name, m.id)));
    if (!(await storage.get("welcomed-" + active.key))) {
      $("#welcome").showModal();
      await storage.set("welcomed-" + active.key, true);
    }
  }
}
$("#pair").onclick = action(async () => {
  const r = await fetch(base + "/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: $("#pair-code").value.trim() }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  session = d.session;
  if (ext) await chrome.storage.session.set({ session });
  else sessionStorage.setItem("cade-session", session);
  $("#pair-code").value = "";
  await refresh();
  notice("Conexão estabelecida. Coleção do perfil carregada.");
});
$("#login").onclick = action(async () => {
  const popup = ext ? null : window.open("about:blank", "_blank");
  try {
    const result = await api("auth/start", {
      account: $("#account").value || undefined,
    });
    if (ext) await chrome.tabs.create({ url: result.url });
    else if (popup) {
      popup.opener = null;
      popup.location = result.url;
    } else throw new Error("Permita abrir a janela de login neste navegador.");
  } catch (e) {
    popup?.close();
    throw e;
  }
  notice(
    "Conclua o login na página da OpenAI e depois clique em Atualizar conexão.",
  );
});
$("#refresh-auth").onclick = action(refresh);
$("#select-account").onclick = action(async () => {
  await api("auth/select", { account: $("#account").value });
  await refresh();
});
$("#logout").onclick = action(async () => {
  const result = await api("auth/logout", { account: $("#account").value });
  await refresh();
  notice(result.message);
});
$("#export-personal").onclick = () =>
  download("cade-doutor-backup-pessoal.json", {
    schemaVersion: 1,
    favorites: personal.favorites,
  });
$("#import-personal").onchange = action(async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 3_000_000) throw new Error("Backup muito grande.");
  const p = validatePersonal(JSON.parse(await f.text()));
  if (
    !confirm(
      "Importar favoritos? Dados com o mesmo identificador serão substituídos pelos dados do arquivo.",
    )
  )
    return;
  await savePersonal({
    ...personal,
    favorites: { ...personal.favorites, ...p.favorites },
  });
  notice("Backup pessoal importado.");
  e.target.value = "";
});
async function importCatalog(next) {
  const diff = compareCatalogs(catalog, next);
  if (
    !confirm(
      `Coleta ${next.collectedAt}: ${diff.added.length} novas, ${diff.changed.length} alteradas e ${diff.missing.length} não localizadas. Aplicar atualização preservando favoritos?`,
    )
  )
    return;
  if (connected) await api("catalog", next, "PUT");
  else await storage.set("catalog", next);
  setCatalog(next);
  notice(
    "Catálogo atualizado. " +
      diff.candidates.length +
      " possível(is) mudança(s) de unidade precisam de revisão.",
  );
}
$("#import-catalog").onchange = action(async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 3_000_000) throw new Error("Catálogo muito grande.");
  await importCatalog(JSON.parse(await f.text()));
  e.target.value = "";
});
$("#update-catalog").onclick = action(async () => {
  const root =
    "https://raw.githubusercontent.com/mikaell7w7/cade-doutor/main/data/";
  const r = await fetch(root + "catalog-index.json");
  if (!r.ok) throw new Error("Não foi possível consultar o GitHub.");
  const index = await r.json();
  if (!/^snapshots\/[a-z0-9-]+\.json$/.test(index.current))
    throw new Error("Índice inválido.");
  const next = await fetch(root + index.current);
  if (!next.ok) throw new Error("Coleta indisponível.");
  await importCatalog(await next.json());
});
$("#export-catalog").onclick = () =>
  download("cade-doutor-catalogo.json", catalog);
$("#open-map").onclick = () => {
  if (ext) chrome.tabs.create({ url: base + "/map.html" });
  else window.open("/map.html", "_blank");
};
$("#ask").onclick = action(async () => {
  if (!selected.size)
    throw new Error("Selecione pelo menos um prestador para comparar.");
  $("#answer").textContent = "";
  $("#ask").disabled = true;
  aborter = new AbortController();
  $("#cancel-ai").hidden = false;
  try {
    const r = await fetch(base + "/api/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cade-Session": session ?? "",
      },
      body: JSON.stringify({
        ids: [...selected],
        question: $("#question").value,
        model: $("#model").value,
        webSearch: $("#web-search").checked,
      }),
      signal: aborter.signal,
    });
    if (!r.ok) {
      const d = await r.json();
      throw new Error(d.error);
    }
    let buffer = "",
      done = false;
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      buffer += decoder.decode(v.value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const e = JSON.parse(line);
        if (e.error) throw new Error(e.error);
        if (e.delta) $("#answer").textContent += e.delta;
        if (e.done) done = true;
      }
    }
    if (!done)
      throw new Error(
        "Resposta interrompida. O texto parcial não foi concluído.",
      );
    notice("Comparação concluída. Confira as fontes citadas antes de decidir.");
  } catch (e) {
    notice(
      e.name === "AbortError"
        ? "Consulta interrompida. O serviço recebeu o cancelamento."
        : e.message,
    );
  } finally {
    $("#ask").disabled = false;
    $("#cancel-ai").hidden = true;
  }
});
$("#cancel-ai").onclick = () => aborter?.abort();
personal = (await storage.get("personal")) ?? personal;
try {
  validatePersonal(personal);
  setCatalog(
    (await storage.get("catalog")) ??
      (await (await fetch("catalog.json")).json()),
  );
  if (ext) {
    const { context } = await chrome.storage.session.get("context");
    if (
      context?.specialty &&
      catalog.categories.some((c) => c.name === context.specialty)
    ) {
      $("#specialty").value = context.specialty;
      render();
    }
  }
  if (session) await refresh();
} catch (e) {
  notice(e.message);
}
