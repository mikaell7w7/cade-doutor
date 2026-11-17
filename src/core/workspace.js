export const colors = ["green", "blue", "purple", "orange", "rose", "gray"];
export const channels = ["Telefone", "WhatsApp", "E-mail", "Presencial", "Outro"];
export const contactStates = [
  "Em contato",
  "Aguardando retorno",
  "Agendado",
  "Concluído",
  "Sem disponibilidade",
];
export const emptyWorkspace = () => ({
  schemaVersion: 1,
  revision: 0,
  chats: [],
  contacts: [],
});
const id = (s) =>
  typeof s === "string" &&
  /^[a-zA-Z0-9_-]{8,80}$/.test(s) &&
  !["__proto__", "constructor", "prototype"].includes(s);
const text = (s, max) => typeof s === "string" && s.length <= max;
const date = (s) => text(s, 40) && Number.isFinite(Date.parse(s));
function check(ok, message) {
  if (!ok) throw new Error(message);
}
function ids(list, max) {
  return Array.isArray(list) && list.length <= max && list.every(id);
}
export function validateWorkspace(value) {
  check(
    value?.schemaVersion === 1 &&
      Array.isArray(value.chats) &&
      value.chats.length <= 200 &&
      Array.isArray(value.contacts) &&
      value.contacts.length <= 3000,
    "Histórico inválido ou limite de registros atingido (200 conversas / 3.000 contatos).",
  );
  const chats = value.chats.map((c) => {
    check(
      id(c.id) &&
        text(c.title, 120) &&
        c.title.trim() &&
        colors.includes(c.color) &&
        Array.isArray(c.tags) &&
        c.tags.length <= 12 &&
        c.tags.every((t) => text(t, 40) && t.trim()) &&
        ids(c.providerIds, 30) &&
        date(c.createdAt) &&
        date(c.updatedAt) &&
        text(c.draft ?? "", 8000) &&
        Array.isArray(c.turns) &&
        c.turns.length <= 200,
      "Conversa inválida ou muito longa.",
    );
    const turns = c.turns.map((t) => {
      check(
        text(t.question, 8000) &&
          t.question.trim() &&
          text(t.text, 100000) &&
          ["pending", "completed", "failed"].includes(t.state) &&
          ids(t.providerIds, 1000) &&
          date(t.createdAt),
        "Mensagem inválida.",
      );
      return {
        question: t.question,
        text: t.text,
        state: t.state,
        providerIds: [...new Set(t.providerIds)],
        createdAt: t.createdAt,
      };
    });
    return {
      id: c.id,
      title: c.title.trim(),
      color: c.color,
      tags: [...new Set(c.tags.map((t) => t.trim()))],
      providerIds: [...new Set(c.providerIds)],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      draft: c.draft ?? "",
      turns,
    };
  });
  const contacts = value.contacts.map((c) => {
    check(
      id(c.id) &&
        id(c.providerId) &&
        text(c.providerName, 250) &&
        text(c.providerAddress, 1000) &&
        date(c.date) &&
        text(c.person, 120) &&
        channels.includes(c.channel) &&
        contactStates.includes(c.status) &&
        text(c.note, 6000) &&
        c.note.trim() &&
        (!c.chatId || id(c.chatId)),
      "Registro de contato inválido.",
    );
    return {
      id: c.id,
      providerId: c.providerId,
      providerName: c.providerName,
      providerAddress: c.providerAddress,
      date: c.date,
      person: c.person,
      channel: c.channel,
      status: c.status,
      note: c.note,
      chatId: c.chatId ?? "",
    };
  });
  check(
    new Set(chats.map((c) => c.id)).size === chats.length &&
      new Set(contacts.map((c) => c.id)).size === contacts.length,
    "Identificadores duplicados no histórico.",
  );
  const clean = { schemaVersion: 1, revision: value.revision ?? 0, chats, contacts };
  check(Number.isSafeInteger(clean.revision) && clean.revision >= 0, "Revisão inválida.");
  check(
    new TextEncoder().encode(JSON.stringify(clean)).length <= 8_000_000,
    "Histórico excede 8 MB. Exporte um backup e remova conversas antigas.",
  );
  return clean;
}
// Keep saved conversations intact; send only a bounded, complete recent context.
export function conversationContext(turns, question) {
  const chosen = [];
  let length = question.length;
  const complete = turns.filter((t) => t.state === "completed");
  for (const t of [...complete].reverse()) {
    if (
      chosen.length === 20 ||
      t.text.length > 30000 ||
      length + t.question.length + t.text.length > 120000
    )
      break;
    chosen.unshift(t);
    length += t.question.length + t.text.length;
  }
  return {
    history: chosen.flatMap((t) => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.text },
    ]),
    omitted: complete.length - chosen.length,
  };
}
