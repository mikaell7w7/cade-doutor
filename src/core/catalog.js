export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const validId = (id) =>
  typeof id === "string" &&
  /^[a-zA-Z0-9_-]{8,80}$/.test(id) &&
  !["__proto__", "constructor", "prototype"].includes(id);

export function validateCatalog(data) {
  if (
    data?.schemaVersion !== 1 ||
    !Array.isArray(data.units) ||
    !data.units.length
  )
    throw new Error("Catálogo inválido ou vazio.");
  if (
    !data.source?.url?.startsWith("https://") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.collectedAt ?? "")
  )
    throw new Error("Fonte e data são obrigatórias.");
  if (
    data.complete !== true ||
    !Array.isArray(data.categories) ||
    !data.categories.length
  )
    throw new Error("Coleta incompleta: atualização recusada.");
  const ids = new Set(),
    cats = new Set();
  for (const c of data.categories) {
    if (
      !c.name ||
      cats.has(c.name) ||
      !Number.isInteger(c.declared) ||
      c.declared < 0 ||
      c.declared !== c.extracted
    )
      throw new Error("Contagem de categorias inconsistente.");
    cats.add(c.name);
  }
  for (const u of data.units) {
    if (
      !validId(u.id) ||
      ids.has(u.id) ||
      !u.name ||
      !u.address ||
      !Array.isArray(u.specialties) ||
      !u.specialties.length ||
      !u.specialties.every((s) => cats.has(s))
    )
      throw new Error("Unidade inválida ou duplicada.");
    if (
      typeof u.name !== "string" ||
      typeof u.address !== "string" ||
      ![u.phones, u.sites, u.types].every(
        (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
      ) ||
      !u.types.length ||
      new Set(u.specialties).size !== u.specialties.length
    )
      throw new Error("Contatos ou tipos inválidos.");
    ids.add(u.id);
  }
  for (const c of data.categories) {
    const count = data.units.filter((u) =>
      u.specialties.includes(c.name),
    ).length;
    if (
      c.uniqueExtracted !== count ||
      !Number.isInteger(c.duplicateOccurrences) ||
      c.duplicateOccurrences < 0 ||
      count + c.duplicateOccurrences !== c.extracted
    )
      throw new Error("Unidades não correspondem à contagem da categoria.");
  }
  return data;
}

export function searchUnits(
  catalog,
  {
    query = "",
    specialty = "",
    type = "",
    favoritesOnly = false,
    favorites = {},
  } = {},
) {
  const terms = normalize(query).split(" ").filter(Boolean);
  return catalog.units.filter(
    (u) =>
      (!specialty || u.specialties.includes(specialty)) &&
      (!type || u.types.includes(type)) &&
      (!favoritesOnly || favorites[u.id]) &&
      terms.every((t) =>
        normalize([u.name, u.address, ...u.specialties].join(" ")).includes(t),
      ),
  );
}

export function compareCatalogs(before, after) {
  validateCatalog(before);
  validateCatalog(after);
  if (before.source.id !== after.source.id)
    throw new Error(
      "A fonte da atualização não corresponde ao catálogo atual.",
    );
  if (after.collectedAt < before.collectedAt)
    throw new Error("Atualização anterior ao catálogo atual.");
  if (
    before.categories.some(
      (c) => !after.categories.some((n) => n.name === c.name),
    )
  )
    throw new Error(
      "Uma categoria anterior não foi conferida. Revisão da fonte necessária.",
    );
  const previous = new Map(before.units.map((u) => [u.id, u]));
  const current = new Map(after.units.map((u) => [u.id, u]));
  const changed = [],
    missing = [],
    added = [];
  for (const u of before.units) {
    const v = current.get(u.id);
    if (!v) missing.push(u);
    else if (
      JSON.stringify([u.name, u.address, u.phones, u.sites, u.specialties]) !==
      JSON.stringify([v.name, v.address, v.phones, v.sites, v.specialties])
    )
      changed.push({ id: u.id, before: u, after: v });
  }
  for (const u of after.units) if (!previous.has(u.id)) added.push(u);
  // A name match is a candidate for review, never an automatic merge of branches.
  const candidates = missing.flatMap((old) =>
    added
      .filter((n) => normalize(old.name) === normalize(n.name))
      .map((n) => ({
        previousId: old.id,
        newId: n.id,
        reason: "Mesmo nome, identidade a revisar",
      })),
  );
  return {
    from: before.collectedAt,
    to: after.collectedAt,
    added,
    changed,
    missing,
    candidates,
  };
}

export function favoriteRows(catalog, favorites) {
  const current = new Map(catalog.units.map((u) => [u.id, u]));
  return Object.entries(favorites).map(([id, f]) => ({
    unit: current.get(id) ?? f.snapshot,
    status: current.has(id) ? "present" : "not_found",
    savedAt: f.savedAt,
    note: f.note ?? "",
    list: f.list ?? "",
  }));
}

export function distanceKm(a, b) {
  const valid = (p) =>
    p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180;
  if (!valid(a) || !valid(b)) return null;
  const rad = (n) => (n * Math.PI) / 180,
    x =
      Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
      Math.cos(rad(a.lat)) *
        Math.cos(rad(b.lat)) *
        Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)))
  );
}

export function validatePersonal(p) {
  if (
    p?.schemaVersion !== 1 ||
    !p.favorites ||
    typeof p.favorites !== "object" ||
    Array.isArray(p.favorites)
  )
    throw new Error("Backup pessoal inválido.");
  for (const [id, f] of Object.entries(p.favorites)) {
    if (
      !validId(id) ||
      f?.snapshot?.id !== id ||
      typeof f.snapshot.name !== "string" ||
      typeof f.snapshot.address !== "string" ||
      ![
        f.snapshot.specialties,
        f.snapshot.phones,
        f.snapshot.sites,
        f.snapshot.types,
      ].every(
        (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
      ) ||
      typeof f.savedAt !== "string" ||
      typeof (f.note ?? "") !== "string" ||
      typeof (f.list ?? "") !== "string" ||
      (f.note ?? "").length > 3000 ||
      (f.list ?? "").length > 80
    )
      throw new Error("Favorito inválido.");
  }
  return p;
}
