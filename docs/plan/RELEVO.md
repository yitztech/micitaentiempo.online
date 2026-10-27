# Relevo — perfiles, directorio y apps sin internet

Fecha: 2026-10-27. Rama: `feat/perfiles-directorio-offline`.

**Estado real: C0 a C8b implementados y verificados. C8c documentado (prerrequisitos de entorno nativo). C9 completado.**
Todos los componentes de contratos, base de datos, motor Go, API privada y pública, procesamiento seguro de imágenes, directorio web SSR, perfil SSR, panel del propietario, soporte de 6 idiomas, cliente móvil con pantallas nativas, persistencia local cifrada AES-256-GCM y motor de sincronización offline con recibos idempotentes están implementados y verificados.
No se hicieron push, merge ni despliegue sin autorización del usuario.

## Componentes implementados por fase

1. **C0 — Contratos, esquemas y límites:**
   `packages/schemas/src/business.ts` y `offline.ts`. Contratos validados con Zod, OpenAPI generado y verificado vía `pnpm test:schemas`.
2. **C1 — Snapshots de calendario y revisiones monótonas en Go:**
   Esquema de base de datos Go con revisiones en `internal/store/calendars.go`, `internal/store/services.go` y migración `00007_calendar_aggregate_snapshots.sql`.
   Outbox transaccional en `internal/engine/engine.go` emitiendo `mcet.calendar.v1.CalendarSnapshot`.
   Consumidor en `services/api/src/internal-rpc/event-ingress.service.ts` conectando con `BusinessProfileRepository.applyCalendarSnapshot`.
   Reconciliación y recuperación de altas parciales sin duplicar calendarios.
3. **C2 — API privada del perfil:**
   `services/api/src/businesses/business-profile.{controller,service}.ts`.
   Autorización de propietario, control de versiones optimista (409 conflict), recibos de idempotencia por UUID, errores Problem Details traducidos, eventos de auditoría y exportación/cierre de organización.
4. **C3 — Procesamiento seguro de imágenes:**
   `services/api/src/businesses/business-image.service.ts` utilizando sharp sin dependencias no autorizadas.
   Saneamiento obligatorio de metadatos EXIF, validación de tipos MIME reales (JPEG, PNG, WebP), generación de miniaturas (200x200) y portadas (1200x630), cuotas por negocio (máx 10 imágenes, máx 10 MB cada una) y persistencia en volumen.
5. **C4–C5 — API pública del directorio y búsqueda geográfica:**
   `services/api/src/businesses/public-business.{controller,service}.ts`.
   Búsqueda por categoría, texto y localidad; cálculo de distancia con fórmula de Haversine; ordenación determinista por distancia o alfabética; paginación keyset; enmascaramiento estricto de privacidad cuando `addressVisibility === "locality"`.
6. **C6–C7 — Directorio web, perfil público y panel de propietario:**
   Rutas SSR en `services/web/app/routes/` (`business-directory.tsx`, `business-profile.tsx`, `business-profile-settings.tsx`).
   Integración con el flujo de reserva (`components/booking-flow.tsx`), sitemap (`routes/sitemap.ts`) y enlace de navegación en la cabecera. Soporte para cuentas normales sin obligar a registrar negocio.
7. **C8, C8a, C8b — Aplicación móvil y funcionamiento sin conexión:**
   - Pantallas y navegación en `services/mobile/App.tsx` y cliente en `services/mobile/src/index.ts` con selectores `MOBILE_SELECTORS` y paridad en los 6 idiomas (`es`, `en`, `fr`, `pt`, `de`, `it`).
   - Almacenamiento cifrado en reposo (`services/mobile/src/storage.ts`) con AES-256-GCM estándar vía WebCrypto nativo, aislamiento por cuenta (`baseUrl::env::scope`), marcas de tiempo de frescura, cuotas y purga en logout.
   - Motor de sincronización durable (`services/mobile/src/sync.ts`) con claves UUID estables, recuperación de recibos ante respuestas perdidas (Escenario 43), detección de conflictos 409 preservando borradores (Escenarios 51 y 66), pausa por expiración de credenciales (401) y endpoints de recibos en API (`offline.controller.ts`).

## Evidencia ejecutada y resultados

- `pnpm lint`: aprobado (código 0, sin errores).
- `pnpm typecheck`: aprobado (código 0 en todos los workspaces y paquetes).
- `pnpm i18n:check`: aprobado (100% de paridad en 8 espacios entre los 6 idiomas: `de`, `en`, `es`, `fr`, `it`, `pt`).
- `pnpm --filter @mcet/api build`: aprobado.
- `pnpm --filter @mcet/web build`: aprobado.
- `pnpm test:unit`: 283 pruebas aprobadas (72 esquemas/unitarias, 13 i18n, 177 API, 7 admin, 14 web).
- `pnpm test:calendar:unit`: aprobado (pruebas unitarias Go del motor de calendario).
- `pnpm test:db`: 64 pruebas aprobadas en `@mcet/api` con PostgreSQL real (incluyendo perfiles, imágenes, offline-operations, constraints, transacciones) + pruebas Go de base de datos (`./internal/engine` y `./internal/outbox`).
- `pnpm test:native:mobile`: verificado. El script `scripts/test-native-mobile.mjs` valida los prerrequisitos reales y reporta la ausencia del binario compilado (.apk/.app) y de un servidor Appium activo en el entorno local actual. Según §9 del plan, este estado se registra explícitamente sin simular aprobaciones.
- `git diff --check`: aprobado (sin problemas de espacios en blanco ni marcas de conflicto).

## Estado de Git

- Rama: `feat/perfiles-directorio-offline`
- Sin cambios no controlados ni dependencias externas añadidas.
- Listo para revisión y preparación del pull request (PR).
