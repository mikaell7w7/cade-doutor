import { createCare } from "./care.js";
import { careRows } from "../core/care.js";
import { createWorkspace } from "./workspace.js";
import { createChatHistory } from "./chat-history.js";
import { createContacts } from "./contacts.js";
import { validateWorkspace } from "../core/workspace.js";
import { createAssistant } from "./chat.js";
import {
  searchUnits,
  validateCatalog,
  compareCatalogs,
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
  assistant,
  chatHistory,
  contacts,
  care;
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
  document.body.classList.toggle("chat-mode", name === "ai");
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
function card(u, missing = false, showDetails = true) {
  const el = document.createElement("article");
  el.className = "card";
  const tags = document.createElement("div");
  tags.className = "tags";
  for (const t of u.types) {
    const s = document.createElement("span");
    s.className = "tag";
    s.dataset.type = t;
    s.textContent =
      { dental: "Odontológico", medical: "Médico", hospital: "Hospital" }[t] ?? t;
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
      button(
        selected.has(u.id) ? "✓ Na comparação" : "+ Comparar",
        () => {
          if (selected.has(u.id)) selected.delete(u.id);
          else {
            if (selected.size >= 30) throw new Error("Selecione até 30 prestadores.");
            selected.add(u.id);
          }
          render();
          chatHistory?.schedule();
        },
        "comparison-toggle",
      ),
    );
  if (!showDetails && selected.size)
    actions.append(
      button(
        "Revisar comparação (" + selected.size + ")",
        reviewComparison,
        "comparison-toggle",
      ),
    );
  if (saved) actions.append(button("Lista e anotações", () => showEditor(u)));
  el.append(tags, h, address, details, phone, links);
  const f = personal.favorites[u.id];
  if (f?.list || f?.note) {
    const n = document.createElement("p");
    n.className = "muted";
    n.textContent = [f.list, f.note].filter(Boolean).join(": ");
    el.append(n);
  }
  if (showDetails)
    actions.append(
      button(
        "Ficha e contatos" +
          (workspace.get().contacts.filter((c) => c.providerId === u.id).length
            ? ` (${workspace.get().contacts.filter((c) => c.providerId === u.id).length})`
            : ""),
        () => openProvider(u.id),
      ),
    );
  actions.append(
    button("Conversar sobre", async () => {
      await chatHistory.fresh(u);
      $("#provider-dialog").close();
      tab("ai");
    }),
  );
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
  $("#chat-catalog").textContent =
    catalog.units.length +
    " unidades · " +
    catalog.categories.length +
    " especialidades · coleta " +
    catalog.collectedAt;
  assistant?.refreshCards();
  if ($("#provider-dialog").open) {
    const unit = catalog.units.find((u) => u.id === $("#provider-dialog").dataset.id);
    if (unit) $("#provider-details").replaceChildren(card(unit, false, false));
  }
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
  $("#results").replaceChildren(...units.slice(0, pageSize).map((u) => card(u)));
  $("#more").hidden = units.length <= pageSize;
  care?.render();
  $("#fav-count").textContent = Object.keys(personal.favorites).length;
  $("#compare-tray").hidden = !selected.size;
  $("#compare-count").textContent = `${selected.size} prestador(es) na comparação`;
  $("#chat-context").textContent =
    $("#scope").value === "selected"
      ? `Comparação: pesquisa restrita a ${selected.size} prestador(es). Altere em Opções da pesquisa.`
      : "Pesquisa em todo o catálogo · selecione prestadores apenas se quiser comparar opções específicas";
  $("#chat-context").dataset.mode = $("#scope").value;
  $("#selection").replaceChildren(
    ...[...selected].map((id) => {
      const u = catalog.units.find((u) => u.id === id);
      return button((u?.name ?? id) + " ×", () => {
        selected.delete(id);
        render();
        chatHistory?.schedule();
      });
    }),
  );
  if (!selected.size)
    $("#selection").textContent =
      "Nenhuma unidade selecionada. Use Todo o catálogo para uma pesquisa ampla.";
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
for (const selector of ["#query", "#type", "#specialty"])
  $(selector).addEventListener("input", () => {
    pageSize = 24;
    render();
  });
$("#more").onclick = () => {
  pageSize += 24;
  render();
};
async function refresh() {
  if (assistant?.isBusy())
    throw new Error("Interrompa a pesquisa antes de atualizar a conexão.");
  await chatHistory?.save();
  const nextStatus = await api("status");
  if (status.active !== nextStatus.active) {
    chatHistory?.detach();
    workspace.reset();
  }
  status = nextStatus;
  assistant?.resetForAccount(status.active);
  contacts?.reset();
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
  await workspace.load();
  await chatHistory.loaded();
  $("#history").textContent = (await api("history"))
    .slice(-3)
    .map(
      (d) =>
        `${d.to}: ${d.added.length} novas, ${d.changed.length} alteradas, ${d.missing.length} não localizadas.`,
    )
    .join("\n");
  $("#model").replaceChildren(new Option("Conecte sua conta para carregar", ""));
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
  notice("Conclua o login na página da OpenAI e depois clique em Atualizar conexão.");
});
$("#refresh-auth").onclick = action(refresh);
$("#select-account").onclick = action(async () => {
  await flushHistory();
  await api("auth/select", { account: $("#account").value });
  chatHistory.detach();
  await refresh();
});
$("#logout").onclick = action(async () => {
  await flushHistory();
  const result = await api("auth/logout", { account: $("#account").value });
  chatHistory.detach();
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
  const root = "https://raw.githubusercontent.com/mikaell7w7/cade-doutor/main/data/";
  const r = await fetch(root + "catalog-index.json");
  if (!r.ok) throw new Error("Não foi possível consultar o GitHub.");
  const index = await r.json();
  if (!/^snapshots\/[a-z0-9-]+\.json$/.test(index.current))
    throw new Error("Índice inválido.");
  const next = await fetch(root + index.current);
  if (!next.ok) throw new Error("Coleta indisponível.");
  await importCatalog(await next.json());
});
$("#export-catalog").onclick = () => download("cade-doutor-catalogo.json", catalog);
$("#open-map").onclick = () => {
  if (ext) chrome.tabs.create({ url: base + "/map.html" });
  else window.open("/map.html", "_blank");
};
function openProvider(id) {
  const unit =
    catalog?.units.find((u) => u.id === id) ??
    personal.favorites[id]?.snapshot ??
    careRows(catalog, personal.favorites, workspace.get()).find((r) => r.unit.id === id)
      ?.unit;
  if (!unit) {
    notice("Unidade não localizada no catálogo atual.");
    return;
  }
  $("#provider-details").replaceChildren(
    card(unit, !catalog.units.some((u) => u.id === id), false),
  );
  $("#provider-dialog").dataset.id = id;
  contacts.show(unit);
  $("#provider-dialog").showModal();
}
$("#close-provider").onclick = () => $("#provider-dialog").close();
const workspace = createWorkspace({
  api,
  notice,
  changed: () => {
    chatHistory?.render();
    contacts?.render();
    care?.render();
  },
});
async function flushHistory() {
  if (assistant.isBusy())
    throw new Error("Interrompa a pesquisa antes de trocar de conta.");
  await chatHistory.save();
  if (workspace.dirty())
    throw new Error("Exporte as alterações pendentes antes de trocar de conta.");
}
assistant = createAssistant({
  base,
  getSession: () => session,
  getAccount: () => status.active,
  getCatalog: () => catalog,
  getSelected: () => selected,
  renderCard: card,
  openProvider,
  notice,
  beforeSubmit: (question) => chatHistory.prepare(question),
  saveChat: () => chatHistory.save(),
  scheduleSave: () => chatHistory?.schedule(),
});
chatHistory = createChatHistory({
  workspace,
  capture: () => assistant.capture(),
  restore: (c) => assistant.restore(c),
  canNavigate: () => !assistant.isBusy(),
  getCatalog: () => catalog,
  openProvider,
  notice,
  getSelection: () => ({ scope: $("#scope").value, selection: [...selected] }),
  restoreSelection: (c) => {
    selected = new Set(
      (c?.selection ?? []).filter((id) => catalog?.units.some((u) => u.id === id)),
    );
    $("#scope").value = c?.scope ?? "catalog";
    $("#selection-wrap").hidden = $("#scope").value !== "selected";
    render();
  },
});
contacts = createContacts({
  workspace,
  currentChat: () => chatHistory.currentId(),
  openChat: async (id) => {
    await chatHistory.open(id);
    tab("ai");
  },
  notice,
});
care = createCare({
  getCatalog: () => catalog,
  getPersonal: () => personal,
  workspace,
  card,
  openRecord: (c) => {
    openProvider(c.providerId);
    contacts.edit(c);
  },
});
$("#scope").addEventListener("change", () => {
  render();
  chatHistory.schedule();
});
function reviewComparison() {
  const units = [...selected]
    .map((id) => catalog.units.find((u) => u.id === id))
    .filter(Boolean);
  const table = document.createElement("table");
  const head = document.createElement("thead"),
    tr = document.createElement("tr");
  for (const title of [
    "Prestador",
    "Endereço",
    "Especialidades",
    "Telefones",
    "Seleção",
  ]) {
    const th = document.createElement("th");
    th.textContent = title;
    tr.append(th);
  }
  head.append(tr);
  table.append(head);
  const body = document.createElement("tbody");
  for (const u of units) {
    const row = document.createElement("tr");
    for (const value of [
      u.name,
      u.address,
      u.specialties.join(" · "),
      u.phones.join(" / "),
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      row.append(td);
    }
    const td = document.createElement("td");
    td.append(
      button("Remover", () => {
        selected.delete(u.id);
        render();
        chatHistory.schedule();
        reviewComparison();
      }),
    );
    row.append(td);
    body.append(row);
  }
  table.append(body);
  $("#comparison-table").replaceChildren(table);
  $("#start-comparison").disabled = units.length < 2;
  $("#start-comparison").textContent =
    units.length < 2
      ? "Selecione pelo menos 2 prestadores"
      : `Abrir conversa para comparar ${units.length} prestadores`;
  if (!$("#comparison-dialog").open) $("#comparison-dialog").showModal();
}
$("#review-comparison").onclick = reviewComparison;
$("#close-comparison").onclick = () => $("#comparison-dialog").close();
$("#clear-comparison").onclick = () => {
  selected.clear();
  render();
  chatHistory.schedule();
};
$("#start-comparison").onclick = action(async () => {
  if (selected.size < 2) return;
  const ids = [...selected];
  const criteria = $("#comparison-criteria").value.trim();
  await chatHistory.compare(
    ids,
    "Compare estes prestadores do catálogo em uma tabela, considerando endereço, especialidades e informações a confirmar com cada unidade. Não presuma avaliações, distâncias ou disponibilidade." +
      (criteria ? " Meus critérios: " + criteria : ""),
  );
  $("#comparison-dialog").close();
  $("#provider-dialog").close();
  document.querySelector(".chat-options").open = false;
  tab("ai");
  $("#question").focus();
  notice(
    "Comparação preparada. Revise a mensagem e clique em Enviar para consultar a IA.",
  );
});
chatHistory.render();
$("#export-workspace").onclick = action(async () => {
  try {
    await chatHistory.save();
  } catch {} // Export also rescues a conflicting local copy.
  download("cade-doutor-conversas-contatos.json", {
    ...validateWorkspace(workspace.get()),
    revision: 0,
  });
});
$("#import-workspace").onchange = action(async (e) => {
  if (assistant.isBusy()) throw new Error("Interrompa a pesquisa antes de importar.");
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 8_100_000) throw new Error("Arquivo excede 8 MB.");
  const imported = validateWorkspace(JSON.parse(await file.text()));
  if (
    !confirm(
      `Importar ${imported.chats.length} conversas e ${imported.contacts.length} contatos neste perfil? IDs iguais serão substituídos. Favoritos permanecem inalterados.`,
    )
  )
    return;
  await chatHistory.save();
  await workspace.update((d) => {
    for (const key of ["chats", "contacts"]) {
      const map = new Map(d[key].map((c) => [c.id, c]));
      imported[key].forEach((c) => map.set(c.id, c));
      d[key] = [...map.values()];
    }
  });
  await chatHistory.loaded();
  notice("Conversas e contatos importados neste perfil.");
  e.target.value = "";
});
$("#reload-workspace").onclick = action(async () => {
  if (assistant.isBusy()) throw new Error("Interrompa a pesquisa antes de recarregar.");
  if (
    workspace.dirty() &&
    !confirm(
      "Recarregar descarta as alterações locais ainda não salvas. Já exportou seu backup e deseja continuar?",
    )
  )
    return;
  workspace.discardPending();
  chatHistory.detach();
  await workspace.load();
  await chatHistory.loaded();
});
window.addEventListener("beforeunload", (e) => {
  if (workspace.dirty() || assistant.isBusy() || chatHistory.unsaved()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden")
    chatHistory.save().catch((e) => notice(e.message));
});
if (ext)
  chrome.storage.onChanged.addListener((changes, area) => {
    const specialty = changes.context?.newValue?.specialty;
    if (
      area === "session" &&
      specialty &&
      catalog?.categories.some((c) => c.name === specialty)
    ) {
      $("#specialty").value = specialty;
      pageSize = 24;
      render();
    }
  });
personal = (await storage.get("personal")) ?? personal;
try {
  validatePersonal(personal);
  setCatalog(
    (await storage.get("catalog")) ?? (await (await fetch("catalog.json")).json()),
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
