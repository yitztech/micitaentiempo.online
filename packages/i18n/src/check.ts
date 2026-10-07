// Falla si un idioma tiene claves que el otro no tiene (lo ejecuta CI).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "locales");
const langs = readdirSync(root).filter((d) => /^[a-z]{2}$/.test(d));

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

let errors = 0;
const namespaces = new Set(langs.flatMap((l) => readdirSync(join(root, l))));
for (const ns of namespaces) {
  const sets = langs.map((l) => {
    try {
      return new Set(keys(JSON.parse(readFileSync(join(root, l, ns), "utf8"))));
    } catch {
      return new Set<string>();
    }
  });
  const all = new Set(sets.flatMap((s) => [...s]));
  for (const key of all) {
    langs.forEach((l, i) => {
      if (!sets[i]?.has(key)) {
        console.error(`Falta ${l}/${ns}: ${key}`);
        errors++;
      }
    });
  }
}
if (errors) process.exit(1);
console.log(`i18n: ${namespaces.size} espacios, ${langs.join(" y ")} completos`);
