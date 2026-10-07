// Genera services/calendar/internal/holidays/data/<CC>.json.gz e index.json.gz con
// date-holidays (código ISC, datos CC-BY-3.0: atribución en /creditos).
// Años: actual − 1 … actual + 5. Uso: pnpm --filter @mcet/holidays-gen generate [año]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import Holidays from "date-holidays";

const OUT = join(import.meta.dirname, "../../services/calendar/internal/holidays/data");
const BASE = Number(process.argv[2] ?? new Date().getUTCFullYear());
const YEARS = Array.from({ length: 7 }, (_, i) => BASE - 1 + i);
const TYPES = new Set(["public", "bank", "school", "optional", "observance"]);

/** Fecha civil local del feriado (date-holidays da "YYYY-MM-DD hh:mm:ss" en hora local). */
const day = (h) => h.date.slice(0, 10);

function list(country, state) {
  const es = new Holidays(country, state ?? undefined, { languages: ["es"] });
  const en = new Holidays(country, state ?? undefined, { languages: ["en"] });
  const out = new Map();
  for (const year of YEARS) {
    const esList = es.getHolidays(year, "es") ?? [];
    const enList = en.getHolidays(year, "en") ?? [];
    esList.forEach((h, i) => {
      if (!TYPES.has(h.type)) return;
      const other =
        enList[i]?.date === h.date ? enList[i] : enList.find((x) => x.date === h.date && x.rule === h.rule);
      const key = `${day(h)}|${h.rule}`;
      out.set(key, {
        d: day(h),
        t: h.type,
        n: { es: h.name, en: other?.name ?? h.name },
        ...(h.substitute ? { s: true } : {}),
      });
    });
  }
  return out;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const hd = new Holidays();
const namesEs = hd.getCountries("es");
const namesEn = hd.getCountries("en");
const index = {};
let total = 0;
for (const code of Object.keys(namesEn).sort()) {
  const national = list(code);
  const holidays = [...national.values()];
  const subdivisions = {};
  const statesEs = hd.getStates(code, "es") ?? {};
  const statesEn = hd.getStates(code, "en") ?? {};
  for (const state of Object.keys(statesEn).sort()) {
    const iso = `${code}-${state}`;
    subdivisions[iso] = { es: statesEs[state] ?? statesEn[state], en: statesEn[state] };
    for (const [key, h] of list(code, state)) {
      if (!national.has(key)) holidays.push({ ...h, r: iso });
    }
  }
  holidays.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  total += holidays.length;
  index[code] = { names: { es: namesEs[code] ?? namesEn[code], en: namesEn[code] }, subdivisions };
  writeFileSync(
    join(OUT, `${code}.json.gz`),
    gzipSync(JSON.stringify({ country: code, years: YEARS, holidays }), { level: 9 }),
  );
}
writeFileSync(
  join(OUT, "index.json.gz"),
  gzipSync(JSON.stringify({ generatedFrom: "date-holidays 3.37.0", years: YEARS, countries: index }), {
    level: 9,
  }),
);
console.log(`${Object.keys(index).length} países, ${total} feriados, años ${YEARS[0]}–${YEARS.at(-1)}`);
