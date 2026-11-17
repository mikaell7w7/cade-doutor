import { bundledCatalog } from "../src/server/catalog-store.js";
const c = await bundledCatalog(process.cwd());
console.log(
  JSON.stringify({
    source: c.source.id,
    collectedAt: c.collectedAt,
    units: c.units.length,
    categories: c.categories.length,
    occurrences: c.categories.reduce((n, c) => n + c.extracted, 0),
    duplicates: c.categories.reduce((n, c) => n + c.duplicateOccurrences, 0),
  }),
);
