/**
 * Genera los recursos individuales del rediseño a partir de la lámina de referencia
 * (redesign/images/Presentación de marca Mi Cita en Tiempo.png) y de SVG propios.
 *
 *  - SVG: logotipos, isotipo, favicon, decoraciones y avatares (vectoriales, sin recortar la lámina).
 *  - WebP: las dos fotografías, extraídas de las únicas zonas limpias (sin tarjetas encima) de la lámina.
 *    La lámina es de 1254 px, así que las fotos salen con ~170-260 px reales y se reescalan: son
 *    PROVISIONALES hasta contar con fotografías originales de mayor resolución.
 *  - manifest.json: inventario con ubicación, formato, dimensiones, uso, estado y referencia visual.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const A = join(root, "src/assets");
const SRC = join(root, "images/Presentación de marca Mi Cita en Tiempo.png");

const write = (rel, content) => {
  const file = join(A, rel);
  mkdirSync(dirname(file), { recursive: true });
  const title = rel.startsWith("branding") ? "Mi Cita en Tiempo" : "Decoración";
  // <title> para accesibilidad (los <img> usan su propio alt)
  const out =
    rel.endsWith(".svg") && !content.includes("<title")
      ? content.replace(/(<svg[^>]*>)/, `$1<title>${title}</title>`)
      : content;
  writeFileSync(file, out);
};

/* ───────────── Marca ───────────── */

const GRAD = (id, a = "#2563EB", b = "#4338CA", c = "#6D28D9") =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;

/** Isotipo: calendario índigo con confirmación verde (64 × 64). */
const isotype = (gid = "mcet-g") => `
<defs>${GRAD(gid)}</defs>
<rect x="14" y="3" width="6" height="14" rx="3" fill="#fff" stroke="#4338CA" stroke-width="2"/>
<rect x="38" y="3" width="6" height="14" rx="3" fill="#fff" stroke="#4338CA" stroke-width="2"/>
<rect x="4" y="9" width="52" height="49" rx="13" fill="url(#${gid})"/>
<rect x="11" y="21" width="38" height="30" rx="6" fill="#fff" fill-opacity=".9"/>
<circle cx="19" cy="29" r="2.8" fill="#C4B5FD"/><circle cx="29" cy="29" r="2.8" fill="#3B82F6"/><circle cx="39" cy="29" r="2.8" fill="#C4B5FD"/>
<circle cx="19" cy="39" r="2.8" fill="#C4B5FD"/><circle cx="29" cy="39" r="2.8" fill="#C4B5FD"/>
<circle cx="47" cy="47" r="14" fill="#10B981" stroke="#fff" stroke-width="3.5"/>
<path d="M40.5 47.5l4.8 4.8 8.7-9.8" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;

const FONT = `font-family="Inter Variable, Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-weight="800" letter-spacing="-0.8"`;

const horizontal = (
  dark,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 64" role="img" aria-label="Mi Cita en Tiempo">
<g transform="translate(0 0)">${isotype(dark ? "mcet-gd" : "mcet-g")}</g>
<defs>${dark ? GRAD("mcet-t", "#93C5FD", "#A5B4FC", "#C4B5FD") : GRAD("mcet-t", "#2563EB", "#4338CA", "#6D28D9")}</defs>
<text x="72" y="31" font-size="27" ${FONT} fill="${dark ? "#FFFFFF" : "#17162E"}">Mi Cita</text>
<text x="72" y="58" font-size="27" ${FONT} fill="url(#mcet-t)">en Tiempo</text>
</svg>
`;

write("branding/logo-horizontal.svg", horizontal(false));
write("branding/logo-horizontal-dark.svg", horizontal(true));
write(
  "branding/isotipo.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Mi Cita en Tiempo">${isotype()}</svg>\n`,
);
write(
  "branding/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#F8F7FF"/><g transform="translate(5 3) scale(.84)">${isotype("mcet-gf")}</g></svg>\n`,
);
write(
  "branding/isotipo-claro.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Mi Cita en Tiempo"><defs>${GRAD("mcet-gc", "#fff", "#fff", "#fff")}</defs>${isotype(
    "mcet-gc",
  )
    .replace(/<defs>.*?<\/defs>/s, "")
    .replace('fill="#fff" fill-opacity=".9"', 'fill="#4338CA" fill-opacity=".9"')}</svg>\n`,
);

/* ───────────── Decoraciones ───────────── */

write(
  "decorations/sparkle.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><path d="M12 8l5 15" stroke="#7C6BF0" stroke-width="7" stroke-linecap="round"/><path d="M42 24l-17 8" stroke="#7C6BF0" stroke-width="7" stroke-linecap="round" opacity=".85"/></svg>\n`,
);
write(
  "decorations/hero-glow.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="a" cx="78%" cy="28%" r="45%"><stop offset="0" stop-color="#C7D2FE" stop-opacity=".75"/><stop offset="1" stop-color="#F8F7FF" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="10%" cy="85%" r="38%"><stop offset="0" stop-color="#DDD6FE" stop-opacity=".55"/><stop offset="1" stop-color="#F8F7FF" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="#F8F7FF"/><rect width="1200" height="800" fill="url(#a)"/><rect width="1200" height="800" fill="url(#b)"/></svg>\n`,
);
write(
  "decorations/dots-grid.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#A5B4FC"/></pattern></defs><rect width="120" height="120" fill="url(#p)"/></svg>\n`,
);
write(
  "decorations/cta-glow.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4338CA"/><stop offset=".6" stop-color="#5B3FD1"/><stop offset="1" stop-color="#6D28D9"/></linearGradient><radialGradient id="r" cx="85%" cy="10%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect width="1200" height="400" fill="url(#r)"/></svg>\n`,
);

/* ───────────── Avatares (iniciales, vectoriales) ───────────── */

const avatars = [
  ["laura-torres", "LT", "#C7D2FE", "#3730A3"],
  ["ana-garcia", "AG", "#FBCFE8", "#9D174D"],
  ["carlos-mendez", "CM", "#BFDBFE", "#1E40AF"],
  ["pedro-ramirez", "PR", "#DDD6FE", "#5B21B6"],
  ["maria-lopez", "ML", "#A7F3D0", "#065F46"],
  ["sofia-ruiz", "SR", "#FDE68A", "#92400E"],
  ["diego-herrera", "DH", "#FECACA", "#991B1B"],
  ["valeria-cruz", "VC", "#BAE6FD", "#075985"],
];
for (const [slug, ini, bg, fg] of avatars) {
  write(
    `images/avatars/${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${ini}"><circle cx="32" cy="32" r="32" fill="${bg}"/><text x="32" y="32" dy=".35em" text-anchor="middle" font-family="Inter Variable, Inter, system-ui, sans-serif" font-weight="700" font-size="24" fill="${fg}">${ini}</text></svg>\n`,
  );
}

/* ───────────── Fotografías (WebP) ───────────── */

const photos = [
  // [archivo, región {left, top, width, height} en la lámina, anchos de salida, referencia]
  [
    "hero/hero-profesional",
    { left: 393, top: 112, width: 162, height: 156 },
    [480, 960],
    "Hero · fotografía principal (profesional sonriendo)",
  ],
  [
    "professionals/negocio-tablet",
    { left: 397, top: 849, width: 250, height: 160 },
    [640, 1100],
    "Sección «Agenda, gestiona y haz crecer tu negocio»",
  ],
];
for (const [name, region, widths] of photos) {
  for (const w of widths) {
    const out = join(A, "images", `${name}-${w}.webp`);
    mkdirSync(dirname(out), { recursive: true });
    await sharp(SRC)
      .extract(region)
      .resize({ width: w, kernel: "lanczos3" })
      .modulate({ saturation: 1.04 })
      .sharpen({ sigma: 0.8, m1: 0.8, m2: 1.6 })
      .webp({ quality: 84, effort: 5 })
      .toFile(out);
  }
}

/* ───────────── Manifiesto ───────────── */

const entries = [
  [
    "Logotipo horizontal",
    "branding/logo-horizontal.svg",
    "SVG",
    "Cabecera, pie y autenticación (fondo claro)",
    "generado (vectorial)",
    "Logotipo superior izquierdo",
  ],
  [
    "Logotipo horizontal oscuro",
    "branding/logo-horizontal-dark.svg",
    "SVG",
    "Fondos oscuros o índigo (CTA, pie)",
    "generado (vectorial)",
    "Logotipo · variante fondo oscuro",
  ],
  [
    "Isotipo",
    "branding/isotipo.svg",
    "SVG",
    "Avatar de marca, sidebar colapsado, móvil",
    "generado (vectorial)",
    "Isotipo calendario + check verde",
  ],
  [
    "Isotipo claro",
    "branding/isotipo-claro.svg",
    "SVG",
    "Sobre fondos índigo",
    "generado (vectorial)",
    "Isotipo · variante monocromática",
  ],
  ["Favicon", "branding/favicon.svg", "SVG", "Pestaña del navegador", "generado (vectorial)", "Isotipo"],
  [
    "Destello",
    "decorations/sparkle.svg",
    "SVG",
    "Acento junto a fotografías",
    "generado (vectorial)",
    "Trazos violeta junto a la foto del hero",
  ],
  [
    "Resplandor del hero",
    "decorations/hero-glow.svg",
    "SVG",
    "Fondo del hero",
    "generado (vectorial)",
    "Degradado lila del hero",
  ],
  [
    "Rejilla de puntos",
    "decorations/dots-grid.svg",
    "SVG",
    "Textura decorativa",
    "generado (vectorial)",
    "Ambiente del hero",
  ],
  [
    "Fondo CTA",
    "decorations/cta-glow.svg",
    "SVG",
    "Bloque CTA final y paneles índigo",
    "generado (vectorial)",
    "Gradiente índigo → violeta",
  ],
  ...avatars.map(([slug, ini]) => [
    `Avatar ${ini}`,
    `images/avatars/${slug}.svg`,
    "SVG",
    "Citas, clientes, testimonios",
    "generado (iniciales; la lámina solo trae rostros de ~25 px)",
    "Avatares del panel",
  ]),
  ...photos.flatMap(([name, , widths, ref]) =>
    widths.map((w) => [
      `Fotografía ${name.split("/")[1]} ${w}w`,
      `images/${name}-${w}.webp`,
      "WebP",
      name.startsWith("hero") ? "Hero de la home" : "Sección de funcionalidades de la home",
      "PROVISIONAL: extraída de la lámina de referencia (baja resolución); sustituir por fotografía original",
      ref,
    ]),
  ),
  [
    "Iconos de categorías",
    "(lucide-react)",
    "SVG (componente)",
    "Tarjetas de categoría",
    "usa Lucide; sin archivos propios",
    "Fila «Una solución, muchas posibilidades»",
  ],
];

const rows = [];
for (const [nombre, ubicacion, formato, uso, estado, referencia] of entries) {
  let dimensiones = "n/a";
  let existe = true;
  if (ubicacion.startsWith("(")) {
    rows.push({ nombre, ubicacion, formato, dimensiones, uso, estado, referencia, existe });
    continue;
  }
  const file = join(A, ubicacion);
  existe = existsSync(file) && statSync(file).size > 0;
  if (existe) {
    if (formato === "WebP") {
      const m = await sharp(file).metadata();
      dimensiones = `${m.width}×${m.height}`;
    } else {
      const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(readFileSync(file, "utf8"));
      dimensiones = vb ? `viewBox ${vb[1]}×${vb[2]}` : "vectorial";
    }
  }
  rows.push({
    nombre,
    ubicacion: relative(root, file),
    formato,
    dimensiones,
    uso,
    estado,
    referencia,
    existe,
  });
}
writeFileSync(join(A, "manifest.json"), `${JSON.stringify(rows, null, 2)}\n`);

// public/: favicon
mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public/favicon.svg"), readFileSync(join(A, "branding/favicon.svg")));

const faltan = rows.filter((r) => !r.existe);
console.log(`${rows.length} recursos inventariados, ${faltan.length} faltantes`);
if (faltan.length) {
  console.error(faltan.map((r) => r.ubicacion).join("\n"));
  process.exit(1);
}
