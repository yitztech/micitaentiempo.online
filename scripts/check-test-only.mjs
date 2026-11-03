#!/usr/bin/env node
// Falla si un servicio que solo existe para las pruebas llega a producción (AGENTS.md §35).
// La lista se mantiene a mano: al añadir un servicio de pruebas, se añade aquí y se etiqueta en compose.ci.yml.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const SOLO_PRUEBAS = ["mailpit", "captura", "radicale"];
const ETIQUETA = "mcet.solo-pruebas";

function leer(ruta) {
  try {
    return readFileSync(join(RAIZ, ruta), "utf8");
  } catch {
    return "";
  }
}

const errores = [];

const ci = leer("compose.ci.yml");
const lineas = ci.split("\n");
for (const servicio of SOLO_PRUEBAS) {
  const inicio = lineas.indexOf(`  ${servicio}:`);
  if (inicio === -1) {
    errores.push(`compose.ci.yml no define el servicio de pruebas «${servicio}»`);
    continue;
  }
  const fin = lineas.findIndex(
    (linea, indice) => indice > inicio && /^( {2}[A-Za-z0-9_.-]+:|\S)/.test(linea),
  );
  const bloque = lineas.slice(inicio, fin === -1 ? undefined : fin).join("\n");
  if (!new RegExp(`${ETIQUETA}:\\s*"?true"?`).test(bloque)) {
    errores.push(`compose.ci.yml: al servicio «${servicio}» le falta la etiqueta ${ETIQUETA}: "true"`);
  }
}

const produccion = leer("compose.prod.yml");
for (const servicio of SOLO_PRUEBAS) {
  if (new RegExp(`^  ${servicio}:`, "m").test(produccion)) {
    errores.push(`compose.prod.yml define el servicio de pruebas «${servicio}»`);
  }
}

const desplegar = leer(".github/workflows/deploy.yml");
const dockerfiles = [
  "services/gateway",
  "services/web",
  "services/api",
  "services/calendar",
  "services/admin",
  "services/postgres",
].map((servicio) => leer(`${servicio}/Dockerfile`));

for (const servicio of SOLO_PRUEBAS) {
  const patron = new RegExp(`\\b${servicio}\\b`, "i");
  if (patron.test(desplegar))
    errores.push(`deploy.yml menciona «${servicio}», que solo existe para las pruebas`);
  dockerfiles.forEach((contenido, indice) => {
    if (patron.test(contenido)) {
      errores.push(`el Dockerfile de producción n.º ${indice + 1} menciona «${servicio}»`);
    }
  });
}

if (errores.length > 0) {
  console.error("Servicios solo de pruebas en producción:");
  for (const error of errores) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`check-test-only: ${SOLO_PRUEBAS.length} servicios de pruebas fuera de producción`);
