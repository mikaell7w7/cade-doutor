import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateCatalog,
  compareCatalogs,
  searchUnits,
  favoriteRows,
  distanceKm,
  validatePersonal,
} from "../src/core/catalog.js";
const original = JSON.parse(
  await readFile(
    new URL("../data/snapshots/tst-saude-2026-11-17.json", import.meta.url),
  ),
);
const unit = (id, name = "Clínica Exemplo", address = "Rua A") => ({
  id,
  name,
  address,
  phones: [],
  sites: [],
  types: ["dental"],
  specialties: ["ODONTOLOGIA"],
});
export const fixture = (units = [unit("tst-example")]) => ({
  schemaVersion: 1,
  source: { id: "test", url: "https://example.org" },
  collectedAt: "2026-11-17",
  complete: true,
  categories: [
    {
      name: "ODONTOLOGIA",
      declared: units.length,
      extracted: units.length,
      uniqueExtracted: units.length,
      duplicateOccurrences: 0,
    },
  ],
  units,
});
test("baseline validates all 131 categories and nine duplicate occurrences", () => {
  validateCatalog(original);
  assert.equal(original.units.length, 690);
  assert.equal(original.categories.length, 131);
  assert.equal(
    original.categories.reduce((n, c) => n + c.extracted, 0),
    3129,
  );
  assert.equal(
    original.categories.reduce((n, c) => n + c.duplicateOccurrences, 0),
    9,
  );
  assert.equal(searchUnits(original, { type: "dental" }).length, 142);
});
test("search ignores accents and combines type, specialty and text", () => {
  const c = fixture();
  assert.equal(
    searchUnits(c, {
      query: "clinica rua",
      type: "dental",
      specialty: "ODONTOLOGIA",
    }).length,
    1,
  );
  assert.equal(searchUnits(c, { type: "hospital" }).length, 0);
});
test("partial snapshots and forged counts cannot remove entries", () => {
  const c = fixture();
  c.complete = false;
  assert.throws(() => compareCatalogs(fixture(), c), /incompleta/);
  c.complete = true;
  c.units.push(unit("tst-another"));
  assert.throws(() => validateCatalog(c), /contagem/);
});
test("a missing category cannot silently become a removal", () => {
  const c = fixture();
  c.categories.push({
    name: "EXTRA",
    declared: 0,
    extracted: 0,
    uniqueExtracted: 0,
    duplicateOccurrences: 0,
  });
  assert.throws(() => compareCatalogs(c, fixture()), /categoria anterior/);
});
test("favorites keep their snapshot, note and list when absent", () => {
  const before = fixture(),
    next = fixture([unit("tst-nextid")]),
    u = before.units[0],
    favorites = {
      [u.id]: {
        snapshot: u,
        savedAt: "2026-11-17",
        note: "Ligar amanhã",
        list: "Dentistas",
      },
    };
  assert.equal(compareCatalogs(before, next).missing.length, 1);
  const [row] = favoriteRows(next, favorites);
  assert.equal(row.status, "not_found");
  assert.equal(row.note, "Ligar amanhã");
  assert.equal(row.unit.id, u.id);
});
test("same-name branches become review candidates, never merged", () => {
  const d = compareCatalogs(
    fixture(),
    fixture([
      unit("tst-new-one", "Clínica Exemplo", "Rua B"),
      unit("tst-new-two", "Clínica Exemplo", "Rua C"),
    ]),
  );
  assert.equal(d.candidates.length, 2);
  assert.equal(d.added.length, 2);
  assert.equal(d.missing.length, 1);
});
test("source and chronology mismatches are rejected", () => {
  let c = fixture();
  c.source.id = "other";
  assert.throws(() => compareCatalogs(fixture(), c), /fonte/);
  c = fixture();
  c.collectedAt = "2026-10-01";
  assert.throws(() => compareCatalogs(fixture(), c), /anterior/);
});
test("dangerous object keys and malformed personal backups are rejected", () => {
  const u = unit("__proto__");
  assert.throws(() => validateCatalog(fixture([u])));
  assert.throws(() =>
    validatePersonal({
      schemaVersion: 1,
      favorites: { "tst-example": { snapshot: { id: "other" } } },
    }),
  );
});
test("distance is an estimate, invalid/missing coordinates return null", () => {
  assert.equal(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) <
      0.01,
  );
  assert.equal(distanceKm(null, { lat: 0, lng: 0 }), null);
  assert.equal(distanceKm({ lat: 100, lng: 0 }, { lat: 0, lng: 0 }), null);
});
