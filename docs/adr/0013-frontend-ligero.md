# 0013. Catálogos tipados sin i18next, ALTCHA propio y presupuesto de JavaScript realista

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

El plan (07-frontend.md) proponía i18next + react-i18next, el widget `altcha` y un presupuesto de 90 KB de
JavaScript comprimido en las páginas públicas. Al construir F6 se midió:

- React 19 + React Router 8 hidratando una página ya ocupan unos 105 KB comprimidos (`react-dom` solo, ~60 KB).
- El widget `altcha` 3.3 pesa 118 KB minificado (unos 40 KB comprimidos) y crea Web Workers desde `blob:`.
- i18next añade unos 15 KB y, con SSR, obliga a sincronizar recursos entre servidor y cliente.

## Decisión

1. **Catálogos JSON tipados** en `packages/i18n`. El loader raíz envía al cliente solo el catálogo del idioma
   del dominio (dentro del HTML, no del JavaScript) y los componentes lo leen con `useT()`. Las claves se
   comprueban con TypeScript y `pnpm i18n:check`; las variables con `interpolate`.
2. **ALTCHA propio:** `altcha-lib` (el mismo protocolo que verifica `api`) resuelve el reto en Web Workers del
   propio origen (sin `blob:`) y la interfaz usa los textos del catálogo. Unos 3 KB.
3. **Presupuesto de páginas públicas: ≤ 130 KB** de JavaScript comprimido (medido en el escenario
   «La portada respeta el presupuesto de JavaScript»). Reserva y embed se revisan al construirlos en F7.

## Consecuencias

Menos dependencias y textos 100 % en catálogos (un escenario compara las páginas en los dos idiomas). Los
plurales se resuelven con `Intl.PluralRules` cuando hagan falta, sin la sintaxis de i18next.
