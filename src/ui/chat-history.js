import { normalize } from "../core/catalog.js";
export function createChatHistory({
  workspace,
  capture,
  restore,
  canNavigate,
  getCatalog,
  openProvider,
  notice,
}) {
  const $ = (s) => document.querySelector(s);
  let active = null,
    timer;
  const act =
    (fn) =>
    async (...args) => {
      try {
        await fn(...args);
      } catch (e) {
        notice(e.message);
      }
    };
  const current = () => workspace.get().chats.find((c) => c.id === active);
  function render() {
    const c = current();
    $("#active-chat-title").textContent = c?.title ?? "Nova conversa";
    $("#active-chat-tags").textContent = c
      ? c.tags.map((t) => "#" + t).join(" · ")
      : "Seu histórico de pesquisas e escolhas";
    $("#active-chat-title").dataset.color = c?.color ?? "green";
    $("#history-state").textContent = !workspace.ready()
      ? "Conecte o serviço para carregar seu histórico."
      : workspace.dirty()
        ? "Alterações ainda não salvas"
        : `${workspace.get().chats.length} conversas · salvas neste computador`;
    $("#edit-chat").disabled = !c;
    const query = normalize($("#chat-search").value).replace(/^#/, "");
    const chats = [...workspace.get().chats]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter((c) =>
        normalize(
          [
            c.title,
            ...c.tags,
            ...c.providerIds.map(
              (id) => getCatalog()?.units.find((u) => u.id === id)?.name ?? "",
            ),
          ].join(" "),
        ).includes(query),
      );
    $("#chat-list").replaceChildren(
      ...chats.map((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chat-list-item" + (c.id === active ? " selected" : "");
        b.dataset.color = c.color;
        b.setAttribute("aria-current", String(c.id === active));
        const title = document.createElement("strong"),
          meta = document.createElement("small");
        title.textContent = c.title;
        meta.textContent = [
          c.tags.map((t) => "#" + t).join(" "),
          new Date(c.updatedAt).toLocaleDateString("pt-BR"),
        ]
          .filter(Boolean)
          .join(" · ");
        b.append(title, meta);
        b.onclick = act(() => open(c.id));
        return b;
      }),
    );
  }
  async function save() {
    clearTimeout(timer);
    timer = null;
    if (!active || !workspace.ready()) return;
    const id = active,
      snapshot = capture();
    const existing = current();
    if (
      !workspace.dirty() &&
      existing?.draft === snapshot.draft &&
      JSON.stringify(existing.turns) === JSON.stringify(snapshot.turns)
    )
      return;
    await workspace.update((d) => {
      const c = d.chats.find((c) => c.id === id);
      if (c) {
        c.turns = snapshot.turns;
        c.draft = snapshot.draft;
        c.updatedAt = new Date().toISOString();
      }
    });
  }
  async function prepare(question, providerId) {
    if (!workspace.ready())
      throw new Error(
        "Abra Conexão e carregue seu histórico antes de iniciar a conversa.",
      );
    if (active) return;
    const c = {
      id: crypto.randomUUID(),
      title: question.slice(0, 120) || "Nova conversa",
      color: "green",
      tags: [],
      providerIds: providerId ? [providerId] : [],
      turns: [],
      draft: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await workspace.update((d) => d.chats.push(c));
    active = c.id;
    render();
  }
  async function open(id) {
    if (!canNavigate())
      throw new Error("Interrompa a pesquisa atual antes de trocar de conversa.");
    await save();
    active = id;
    const c = current();
    if (!c) throw new Error("Conversa não encontrada.");
    restore(c);
    render();
    $("#ai").classList.remove("show-chats");
    $("#toggle-chats").setAttribute("aria-expanded", "false");
  }
  async function fresh(provider) {
    if (!canNavigate())
      throw new Error("Interrompa a pesquisa atual antes de abrir outra conversa.");
    await save();
    active = null;
    restore(null);
    if (provider) {
      await prepare("Atendimento · " + provider.name, provider.id);
      restore({
        ...current(),
        draft: `Quero pesquisar sobre ${provider.name}, ${provider.address}.`,
      });
      await save();
    }
    render();
    $("#ai").classList.remove("show-chats");
    $("#toggle-chats").setAttribute("aria-expanded", "false");
  }
  $("#new-chat").onclick = act(() => fresh());
  $("#chat-search").oninput = render;
  $("#close-chats").onclick = () => {
    $("#ai").classList.remove("show-chats");
    $("#toggle-chats").setAttribute("aria-expanded", "false");
  };
  $("#toggle-chats").onclick = () => {
    const open = $("#ai").classList.toggle("show-chats");
    $("#toggle-chats").setAttribute("aria-expanded", String(open));
  };
  $("#edit-chat").onclick = () => {
    const c = current();
    if (!c) return;
    $("#chat-title").value = c.title;
    $("#chat-color").value = c.color;
    $("#chat-tags").value = c.tags.join(", ");
    $("#chat-provider").replaceChildren(
      new Option("Sem novo vínculo", ""),
      ...(getCatalog()?.units ?? [])
        .filter((u) => !c.providerIds.includes(u.id))
        .map((u) => new Option(u.name + " · " + u.address, u.id)),
    );
    $("#chat-linked-providers").replaceChildren(
      ...c.providerIds.map((id) => {
        const row = document.createElement("div"),
          b = document.createElement("button"),
          remove = document.createElement("button");
        b.type = remove.type = "button";
        b.className = remove.className = "secondary";
        b.textContent = getCatalog()?.units.find((u) => u.id === id)?.name ?? id;
        b.onclick = () => openProvider(id);
        remove.textContent = "Desvincular";
        remove.onclick = act(async () => {
          await workspace.update((d) => {
            const x = d.chats.find((x) => x.id === active);
            x.providerIds = x.providerIds.filter((x) => x !== id);
          });
          row.remove();
        });
        row.className = "actions";
        row.append(b, remove);
        return row;
      }),
    );
    $("#chat-editor").showModal();
  };
  $("#close-chat-editor").onclick = () => $("#chat-editor").close();
  $("#chat-editor-form").onsubmit = act(async (e) => {
    e.preventDefault();
    const id = active;
    await workspace.update((d) => {
      const c = d.chats.find((c) => c.id === id);
      c.title = $("#chat-title").value;
      c.color = $("#chat-color").value;
      c.tags = $("#chat-tags")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const provider = $("#chat-provider").value;
      if (provider && !c.providerIds.includes(provider)) c.providerIds.push(provider);
      c.updatedAt = new Date().toISOString();
    });
    $("#chat-editor").close();
    render();
  });
  $("#delete-chat").onclick = act(async () => {
    if (!canNavigate())
      throw new Error("Interrompa a pesquisa antes de excluir a conversa.");
    if (!confirm("Excluir esta conversa? Os contatos e favoritos serão preservados."))
      return;
    const id = active;
    clearTimeout(timer);
    timer = null;
    await workspace.update((d) => {
      d.chats = d.chats.filter((c) => c.id !== id);
      d.contacts.forEach((c) => {
        if (c.chatId === id) c.chatId = "";
      });
    });
    active = null;
    restore(null);
    $("#chat-editor").close();
    render();
  });
  return {
    render,
    save,
    prepare,
    open,
    fresh,
    currentId: () => active,
    schedule() {
      if (timer || !active) return;
      $("#history-state").textContent = "Salvando conversa…";
      timer = setTimeout(() => {
        timer = null;
        save().catch((e) => notice(e.message));
      }, 1000);
    },
    unsaved: () => !!timer,
    async loaded() {
      clearTimeout(timer);
      timer = null;
      active = null;
      restore(null);
      render();
    },
    detach() {
      clearTimeout(timer);
      timer = null;
      active = null;
      restore(null);
      render();
    },
  };
}
