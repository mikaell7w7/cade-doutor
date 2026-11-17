import { normalize } from "../core/catalog.js";

const text = { type: "string" };
export const catalogTools = {
  type: "namespace",
  name: "catalog",
  description:
    "Pesquisa somente leitura em toda a rede credenciada atual. Não acessa favoritos, notas ou credenciais.",
  tools: [
    {
      type: "function",
      name: "search_catalog",
      strict: true,
      description:
        'Busca em todas as unidades do escopo atual. Filtros combinados por E. query contém termos de nome/endereço, specialty aceita parte do nome de especialidade, region aceita parte do endereço, type é dental/medical/hospital ou vazio. Vazio significa sem filtro. Retorna total e paginação, não somente as primeiras unidades. Para ortodontia use specialty="ORTODONTIA", query="". Não procure a frase natural inteira. Se uma região não retornar unidades, amplie e explique a mudança; não presuma distância.',
      parameters: {
        type: "object",
        properties: {
          query: text,
          specialty: text,
          region: text,
          type: { type: "string", enum: ["", "dental", "medical", "hospital"] },
          offset: { type: "integer", minimum: 0 },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["query", "specialty", "region", "type", "offset", "limit"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_providers",
      strict: true,
      description:
        "Consulta fichas oficiais do catálogo por IDs recebidos da busca, inclusive para refinar uma conversa anterior. Não invente IDs.",
      parameters: {
        type: "object",
        properties: { ids: { type: "array", items: text, minItems: 1, maxItems: 20 } },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  ],
};

export function publicUnit(u) {
  return {
    id: u.id,
    name: u.name,
    address: u.address,
    phones: u.phones,
    sites: u.sites,
    specialties: u.specialties,
    types: u.types,
  };
}
export function executeCatalogTool(catalog, call, allowedIds = null) {
  if (call.namespace && call.namespace !== "catalog")
    throw new Error("Ferramenta fora do catálogo.");
  const name = call.name?.replace(/^catalog\./, ""),
    args = JSON.parse(call.arguments);
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Parâmetros inválidos.");
  const scope = allowedIds
    ? catalog.units.filter((u) => allowedIds.has(u.id))
    : catalog.units;
  let units,
    total,
    offset = 0,
    limit = 0,
    criteria;
  if (name === "search_catalog") {
    for (const k of ["query", "specialty", "region", "type"])
      if (typeof args[k] !== "string" || args[k].length > 250)
        throw new Error("Filtro inválido.");
    if (
      !["", "dental", "medical", "hospital"].includes(args.type) ||
      !Number.isInteger(args.offset) ||
      args.offset < 0 ||
      args.offset > 100000 ||
      !Number.isInteger(args.limit) ||
      args.limit < 1 ||
      args.limit > 50
    )
      throw new Error("Paginação ou tipo inválido.");
    const terms = normalize(args.query).split(" ").filter(Boolean),
      region = normalize(args.region),
      specialty = normalize(args.specialty);
    units = scope.filter(
      (u) =>
        (!args.type || u.types.includes(args.type)) &&
        (!region || normalize(u.address).includes(region)) &&
        (!specialty || u.specialties.some((s) => normalize(s).includes(specialty))) &&
        terms.every((t) =>
          normalize([u.name, u.address, ...u.specialties].join(" ")).includes(t),
        ),
    );
    total = units.length;
    offset = args.offset;
    limit = args.limit;
    units = units.slice(offset, offset + limit);
    criteria = {
      query: args.query,
      specialty: args.specialty,
      region: args.region,
      type: args.type,
    };
  } else if (name === "get_providers") {
    if (
      !Array.isArray(args.ids) ||
      args.ids.length < 1 ||
      args.ids.length > 20 ||
      !args.ids.every((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id))
    )
      throw new Error("Identificadores inválidos.");
    units = scope.filter((u) => args.ids.includes(u.id));
    total = units.length;
    limit = 20;
  } else throw new Error("Ferramenta não permitida.");
  return {
    source: catalog.source,
    collectedAt: catalog.collectedAt,
    scopeSize: scope.length,
    total,
    offset,
    nextOffset: offset + units.length < total ? offset + units.length : null,
    criteria,
    units: units.map(publicUnit),
  };
}

export function validateConversation(question, history = []) {
  if (typeof question !== "string" || !question.trim() || question.length > 8000)
    throw new Error("Escreva uma pergunta com até 8.000 caracteres.");
  if (!Array.isArray(history) || history.length > 40)
    throw new Error("Conversa muito longa. Inicie uma nova conversa.");
  let length = question.length;
  for (const [i, m] of history.entries()) {
    if (
      m?.role !== (i % 2 === 0 ? "user" : "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim() ||
      m.content.length > (m.role === "user" ? 8000 : 30000)
    )
      throw new Error("Histórico inválido. Inicie uma nova conversa.");
    length += m.content.length;
  }
  if (history.length % 2 !== 0 || length > 120000)
    throw new Error("Conversa muito longa. Inicie uma nova conversa.");
  return history.map(({ role, content }) => ({ role, content }));
}
