import { contactTone } from "../core/care.js";
import { channels, contactStates } from "../core/workspace.js";
export function createContacts({ workspace, currentChat, openChat, notice }) {
  const $ = (s) => document.querySelector(s),
    act =
      (fn) =>
      async (...args) => {
        try {
          await fn(...args);
        } catch (e) {
          notice(e.message);
        }
      };
  let provider = null,
    editing = null;
  function render() {
    if (!provider) return;
    const contacts = workspace
      .get()
      .contacts.filter((c) => c.providerId === provider.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    $("#contact-list").replaceChildren(
      ...contacts.map((c) => {
        const row = document.createElement("article"),
          title = document.createElement("strong"),
          note = document.createElement("p"),
          actions = document.createElement("div");
        row.className = "contact-entry";
        row.dataset.tone = contactTone(c.status);
        actions.className = "actions";
        title.textContent = `${new Date(c.date).toLocaleString("pt-BR")} · ${c.channel} · ${c.status}${c.person ? " · " + c.person : ""}`;
        note.textContent = [
          c.professional ? "Profissional: " + c.professional : "",
          c.note,
          c.nextStep ? "Próximo passo: " + c.nextStep : "",
          c.returnAt
            ? "Retorno previsto: " + new Date(c.returnAt).toLocaleString("pt-BR")
            : "",
        ]
          .filter(Boolean)
          .join("\n");
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Editar registro";
        edit.onclick = () => editor(c);
        actions.append(edit);
        if (workspace.get().chats.some((x) => x.id === c.chatId)) {
          const resume = document.createElement("button");
          resume.type = "button";
          resume.textContent = "Retomar conversa";
          resume.onclick = act(async () => {
            await openChat(c.chatId);
            $("#provider-dialog").close();
          });
          actions.append(resume);
        }
        row.append(title, note, actions);
        return row;
      }),
    );
    if (!contacts.length)
      $("#contact-list").textContent = "Nenhum contato registrado para este prestador.";
    const chats = workspace
      .get()
      .chats.filter(
        (c) =>
          c.providerIds.includes(provider.id) ||
          c.turns.some((t) => t.providerIds.includes(provider.id)),
      );
    $("#provider-chats").replaceChildren(
      ...chats.map((c) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "related-chat";
        b.dataset.color = c.color;
        b.textContent = `${c.title}${c.archived ? " · Arquivada" : ""}`;
        b.onclick = act(async () => {
          await openChat(c.id);
          $("#provider-dialog").close();
        });
        return b;
      }),
    );
    if (!chats.length) $("#provider-chats").textContent = "Nenhuma conversa relacionada.";
    $("#new-contact").disabled = !workspace.ready();
  }
  function editor(c) {
    if (!provider || !workspace.ready()) {
      notice("Conecte o serviço para salvar contatos neste perfil.");
      return;
    }
    editing = c?.id ?? null;
    const d = c ? new Date(c.date) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $("#contact-title").textContent =
      (c ? "Editar contato · " : "Registrar contato · ") + provider.name;
    $("#contact-date").value = d.toISOString().slice(0, 16);
    $("#contact-person").value = c?.person ?? "";
    $("#contact-note").value = c?.note ?? "";
    $("#contact-professional").value = c?.professional ?? "";
    $("#contact-next-step").value = c?.nextStep ?? "";
    let returnDate = "";
    if (c?.returnAt) {
      const d = new Date(c.returnAt);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      returnDate = d.toISOString().slice(0, 16);
    }
    $("#contact-return").value = returnDate;
    $("#contact-channel").replaceChildren(...channels.map((t) => new Option(t, t)));
    $("#contact-channel").value = c?.channel ?? channels[0];
    $("#contact-status").replaceChildren(...contactStates.map((t) => new Option(t, t)));
    $("#contact-status").value = c?.status ?? contactStates[0];
    $("#contact-chat").replaceChildren(
      new Option("Sem conversa vinculada", ""),
      ...workspace.get().chats.map((c) => new Option(c.title, c.id)),
    );
    $("#contact-chat").value = c?.chatId ?? currentChat() ?? "";
    $("#delete-contact").hidden = !c;
    $("#contact-editor").showModal();
  }
  $("#new-contact").onclick = () => editor();
  $("#close-contact").onclick = () => $("#contact-editor").close();
  $("#contact-form").onsubmit = act(async (e) => {
    e.preventDefault();
    const c = {
      id: editing ?? crypto.randomUUID(),
      providerId: provider.id,
      providerName: provider.name,
      providerAddress: provider.address,
      date: new Date($("#contact-date").value).toISOString(),
      person: $("#contact-person").value,
      channel: $("#contact-channel").value,
      status: $("#contact-status").value,
      note: $("#contact-note").value,
      professional: $("#contact-professional").value,
      nextStep: $("#contact-next-step").value,
      returnAt: $("#contact-return").value
        ? new Date($("#contact-return").value).toISOString()
        : "",
      chatId: $("#contact-chat").value,
    };
    await workspace.update((d) => {
      d.contacts = d.contacts.filter((x) => x.id !== c.id);
      d.contacts.push(c);
      if (c.chatId) {
        const chat = d.chats.find((x) => x.id === c.chatId);
        if (
          chat &&
          !chat.providerIds.includes(c.providerId) &&
          chat.providerIds.length < 30
        )
          chat.providerIds.push(c.providerId);
      }
    });
    $("#contact-editor").close();
    render();
  });
  $("#delete-contact").onclick = act(async () => {
    if (!confirm("Excluir este registro de contato?")) return;
    await workspace.update((d) => {
      d.contacts = d.contacts.filter((c) => c.id !== editing);
    });
    $("#contact-editor").close();
    render();
  });
  return {
    edit: editor,
    show(unit) {
      provider = unit;
      render();
    },
    render,
    reset() {
      provider = null;
      $("#provider-dialog").close();
      $("#contact-editor").close();
    },
  };
}
