# 0019. Panel de administración en Angular

- Estado: aceptada
- Fecha: 2026-10-20

## Contexto

El panel de superadministración (`services/admin`) se escribió en AngularJS 1.8.3, una versión sin soporte
de la familia 1.x. Su lógica vivía en un único controlador y la librería se vendía en `public/vendor`.

## Decisión

- **Angular 22.2.3** (última estable) en `services/admin/ui`, con componentes standalone, signals y
  `HttpClient`. Sin router: el panel es una sola vista con pestañas, como antes.
- La API Fastify de `services/admin` no cambia. El build de `ng build` escribe en `services/admin/public`,
  que se sirve como antes y se genera en cada build (no se versiona).
- TypeScript 6.0.3, el rango que exige Angular 22 (`>=6.0 <6.1`), igual que `services/api`.

## Consecuencias

- El frontend necesita un paso de build; `pnpm --filter "@mcet/admin..." build` lo cubre.
- La lógica de pestañas, bloqueo y sesión se conserva; las pruebas de componente (`services/admin/ui`) y
  las del servidor (`services/admin`) la cubren.
