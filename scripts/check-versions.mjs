#!/usr/bin/env node
// Un mismo paquete lleva el mismo rango de versión en todos los workspaces (AGENTS.md §3.5).
// Las excepciones se declaran aquí con su motivo; cualquier conflicto nuevo falla.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;

const EXCEPCIONES = new Map([
  [
    "typescript",
    "El paquete web y los de contratos ya usan TypeScript 7; api, admin y admin-ui siguen en 6 hasta migrarlos.",
  ],
]);

function manifiestos() {
  const rutas = ["package.json"];
  for (const carpeta of ["services", "packages", "tools", "tests"]) {
    for (const nombre of readdirSync(join(RAIZ, carpeta))) {
      // services/mobile se instala con npm y tiene su propio lockfile: no es un workspace de pnpm.
      if (carpeta === "services" && nombre === "mobile") continue;
      const ruta = join(carpeta, nombre, "package.json");
      try {
        if (statSync(join(RAIZ, ruta)).isFile()) rutas.push(ruta);
      } catch {
        // No es un workspace con manifiesto.
      }
    }
  }
  const adminUi = "services/admin/ui/package.json";
  if (!rutas.includes(adminUi)) rutas.push(adminUi);
  return rutas;
}

const versiones = new Map();
for (const ruta of manifiestos()) {
  const pkg = JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));
  for (const seccion of ["dependencies", "devDependencies"]) {
    for (const [nombre, rango] of Object.entries(pkg[seccion] ?? {})) {
      if (rango.startsWith("workspace:") || rango.startsWith("file:")) continue;
      const actual = versiones.get(nombre) ?? new Map();
      const donde = actual.get(rango) ?? [];
      donde.push(ruta);
      actual.set(rango, donde);
      versiones.set(nombre, actual);
    }
  }
}

const errores = [];
for (const [nombre, rangos] of [...versiones].sort(([a], [b]) => a.localeCompare(b))) {
  if (rangos.size <= 1 || EXCEPCIONES.has(nombre)) continue;
  const detalle = [...rangos].map(([rango, rutas]) => `${rango} (${rutas.join(", ")})`).join(" | ");
  errores.push(`${nombre}: ${detalle}`);
}

if (errores.length > 0) {
  console.error("Un mismo paquete con versiones distintas entre workspaces:");
  for (const error of errores) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `check-versions: ${versiones.size} paquetes con una sola versión${EXCEPCIONES.size ? ` (${EXCEPCIONES.size} excepción documentada)` : ""}`,
);
