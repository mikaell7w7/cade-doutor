import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateCatalog, compareCatalogs } from "../core/catalog.js";
export async function bundledCatalog(root) {
  const index = JSON.parse(
    await readFile(join(root, "data/catalog-index.json"), "utf8"),
  );
  return validateCatalog(
    JSON.parse(await readFile(join(root, "data", index.current), "utf8")),
  );
}
export async function loadCatalog(root, store) {
  return validateCatalog(
    (await store.read("catalog.json", null)) ?? (await bundledCatalog(root)),
  );
}
export async function replaceCatalog(root, store, next) {
  return store.transaction(async () => {
    const old = await loadCatalog(root, store);
    const diff = compareCatalogs(old, next);
    const history = await store.read("catalog-history.json", []);
    history.push({ ...diff, checkedAt: new Date().toISOString() });
    await store.write("catalog-history.json", history);
    await store.write("catalog.json", next);
    return diff;
  });
}
