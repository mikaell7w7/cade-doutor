import { normalize } from "./catalog.js";
const searchable = (s) =>
  normalize(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const contactTone = (status) =>
  ({
    "Em contato": "blue",
    "Aguardando retorno": "orange",
    Agendado: "purple",
    Concluído: "green",
    "Sem disponibilidade": "rose",
  })[status] ?? "gray";
// Only deliberately saved/linked providers belong to the personal collection.
export function careRows(
  catalog,
  favorites,
  workspace,
  { query = "", view = "all", status = "" } = {},
) {
  const ids = new Set([
    ...Object.keys(favorites),
    ...workspace.contacts.map((c) => c.providerId),
    ...workspace.chats.flatMap((c) => c.providerIds),
  ]);
  const units = new Map(catalog.units.map((u) => [u.id, u]));
  return [...ids]
    .map((id) => {
      const contacts = workspace.contacts
        .filter((c) => c.providerId === id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = contacts[0];
      const chats = workspace.chats.filter((c) => c.providerIds.includes(id));
      const favorite = favorites[id];
      const unit =
        units.get(id) ??
        favorite?.snapshot ??
        (latest
          ? {
              id,
              name: latest.providerName,
              address: latest.providerAddress,
              phones: [],
              specialties: [],
              types: [],
            }
          : {
              id,
              name: "Prestador fora do catálogo · " + id,
              address: "Endereço não disponível",
              phones: [],
              specialties: [],
              types: [],
            });
      return {
        unit,
        missing: !units.has(id),
        favorite,
        contacts,
        chats,
        latest,
        status: latest?.status ?? "Sem contato registrado",
      };
    })
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (view !== "favorites" || r.favorite) &&
        (view !== "contacts" || r.contacts.length) &&
        (view !== "missing" || r.missing) &&
        searchable(
          [
            r.unit.name,
            r.unit.address,
            r.favorite?.list,
            r.favorite?.note,
            ...r.contacts.flatMap((c) => [c.note, c.person, c.professional, c.nextStep]),
            ...r.chats.flatMap((c) => [c.title, ...c.tags]),
          ].join(" "),
        ).includes(searchable(query)),
    )
    .sort(
      (a, b) =>
        (b.latest?.date ?? "").localeCompare(a.latest?.date ?? "") ||
        a.unit.name.localeCompare(b.unit.name, "pt-BR"),
    );
}
