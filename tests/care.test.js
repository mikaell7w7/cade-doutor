import test from "node:test";
import assert from "node:assert/strict";
import { careRows } from "../src/core/care.js";
import { validatePersonal } from "../src/core/catalog.js";
import { emptyWorkspace } from "../src/core/workspace.js";
const unit = (id) => ({
  id,
  name: "Clínica " + id,
  address: "Asa Sul",
  specialties: [],
  phones: [],
  types: [],
});
test("personal collection combines intentional links, latest contact and favorites but not AI search results", () => {
  const catalog = {
    units: [unit("active-one"), unit("linked-one"), unit("searched-only")],
  };
  const favorites = {
    "active-one": {
      snapshot: unit("active-one"),
      note: "Preferência pessoal",
      list: "Filhos",
    },
    "missing-one": { snapshot: unit("missing-one") },
  };
  const workspace = {
    ...emptyWorkspace(),
    chats: [
      {
        title: "Pediatria",
        tags: ["filhos"],
        providerIds: ["linked-one"],
        turns: [{ providerIds: ["searched-only"] }],
      },
    ],
    contacts: [
      {
        id: "contact-one",
        providerId: "active-one",
        date: "2026-11-16T12:00:00Z",
        status: "Em contato",
        note: "Aguardando",
        professional: "Dra. Ana",
      },
      {
        id: "contact-two",
        providerId: "active-one",
        date: "2026-11-17T12:00:00Z",
        status: "Agendado",
        note: "Confirmado",
        person: "Maria",
        nextStep: "Levar documentos",
      },
      {
        id: "contact-old",
        providerId: "contact-only",
        providerName: "Clínica histórica",
        providerAddress: "Gama",
        date: "2026-11-15T12:00:00Z",
        status: "Concluído",
        note: "Atendido",
      },
    ],
  };
  const rows = careRows(catalog, favorites, workspace);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].status, "Agendado");
  assert(!rows.some((r) => r.unit.id === "searched-only"));
  assert.equal(
    careRows(catalog, favorites, workspace, { status: "Em contato" }).length,
    0,
  );
  assert.equal(
    careRows(catalog, favorites, workspace, { query: "dra ana" })[0].unit.id,
    "active-one",
  );
  assert.equal(
    careRows(catalog, favorites, workspace, { query: "documentos" }).length,
    1,
  );
  assert.equal(careRows(catalog, favorites, workspace, { view: "missing" }).length, 2);
  assert.equal(careRows(catalog, favorites, workspace, { view: "favorites" }).length, 2);
  assert.equal(
    careRows(catalog, favorites, workspace, { query: "pediatria" })[0].unit.id,
    "linked-one",
  );
  assert.equal(
    rows.find((r) => r.unit.id === "contact-only").unit.name,
    "Clínica histórica",
  );
});

test("a historical contact outside the catalogue can still be saved as a favorite", () => {
  const [r] = careRows(
    { units: [] },
    {},
    {
      ...emptyWorkspace(),
      contacts: [
        {
          providerId: "historical-unit",
          providerName: "Clínica",
          providerAddress: "Gama",
          date: "2026-11-17T12:00:00Z",
        },
      ],
    },
  );
  assert.doesNotThrow(() =>
    validatePersonal({
      schemaVersion: 1,
      favorites: {
        [r.unit.id]: { snapshot: r.unit, savedAt: "2026-11-17", note: "", list: "" },
      },
    }),
  );
});
