# Rediseño · Mi Cita en Tiempo

SPA de referencia visual del rediseño aprobado (`images/Presentación de marca Mi Cita en Tiempo.png`).
Es **independiente** de `services/web` (SSR) y del workspace del monorepo: tiene su propio `pnpm-workspace.yaml`
y lockfile, y no se conecta a la API. Todo el contenido es de demostración (ver `INFORME.md`).

Stack: React 19.3 · TypeScript 7 · Vite 8 · Tailwind 4 · Radix UI (`radix-ui`) · Lucide · React Router 8 ·
React Hook Form + Zod 4 · Playwright + axe-core.

## Ejecutar

```bash
cd redesign
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # tsc + vite build
pnpm preview        # http://localhost:4173 (sirve dist/)
pnpm typecheck
pnpm test           # 35 pruebas: accesibilidad WCAG 2.2 AA (axe), desbordamiento en 5 anchos y flujos
pnpm capturas       # con `pnpm preview` en marcha: 85 capturas WebP en capturas/
pnpm assets         # regenera recursos y src/assets/manifest.json desde la lámina de referencia
```

## Estructura

```text
src/
  assets/{branding,icons,images/{hero,categories,professionals,avatars},decorations}  + manifest.json
  components/{layout,ui,booking,business,dashboard}
  pages/ (home, directory, features, pricing, auth, not-found, dashboard/*)
  lib/ (data de demostración, assets, utils)  ·  styles/index.css (tokens de diseño)
e2e/ · scripts/ · capturas/
```

Rutas: `/`, `/funciones`, `/precios`, `/directorio`, `/ingresar`, `/registro`, `/recuperar`, `/restablecer`,
`/panel` (+ `calendario`, `clientes`, `avisos`, `preferencias-avisos`, `negocio`, `facturacion`, `ia`, `cuenta`).
