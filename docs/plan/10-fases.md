# 10. Fases de ejecución

Trece fases, cada una con su rama y su PR. Cada fase termina con todo en verde, sus escenarios
automatizados y este plan actualizado si algo cambió. Tamaño relativo: S < M < L < XL.

```mermaid
flowchart LR
  F0[F0 Fundaciones] --> F1[F1 Esqueleto desplegable]
  F1 --> F2[F2 Contratos internos]
  F2 --> F3[F3 Identidad y roles]
  F2 --> F4[F4 Motor: horarios y disponibilidad]
  F4 --> F5[F5 Motor: eventos y reservas]
  F3 --> F6[F6 Frontend base es/en]
  F5 --> F7[F7 Panel, reserva y embed]
  F6 --> F7
  F5 --> F8[F8 Avisos]
  F3 --> F8
  F3 --> F9[F9 Planes y facturación]
  F5 --> F10[F10 Sincronización]
  F7 --> F11[F11 MCP]
  F8 --> F11
  F9 --> F12[F12 Endurecimiento y lanzamiento]
  F10 --> F12
  F11 --> F12
  F12 --> F13[F13 Post-lanzamiento]
```

Tras F2 hay dos líneas que pueden avanzar en paralelo (en sesiones o worktrees distintos): **Go** (F4 → F5
→ F10) y **TypeScript** (F3 → F6 → F7/F8/F9 → F11).

**Hecho significa** (para todas las fases): Biome, tipos, unitarias, integración, permisos y escenarios de
la fase en verde; claves i18n completas en es y en; sin secretos en el diff; `03-versiones.md` y ADR
actualizados si hubo cambios; commit y push en la rama de la fase.

---

## F0 · Fundaciones del repositorio — S · Opus 5.5 `high`

**Objetivo:** un monorepo limpio donde cualquier sesión sepa trabajar.

- [ ] Monorepo pnpm 12.9.1 (`packageManager`, `pnpm-workspace.yaml` con `minimumReleaseAge: 1440`):
      `services/{gateway,web,api,calendar,postgres}`, `packages/{contracts,schemas,i18n,tsconfig}`,
      `tools/holidays-gen`, `tests/{escenarios,fakes,permisos}`, `content/{es,en}`.
- [ ] Biome 2.5 para todo TypeScript; TypeScript 6.0.3 en `api` y 7.0.2 en el resto; módulo Go
      `github.com/yitztech/micitaentiempo.online/services/calendar` con golangci-lint v2; `buf.yaml`.
- [ ] `.gitignore`, `.dockerignore` (de la plantilla, ampliados), `.editorconfig`, `.env.example` completo (§8.8).
- [ ] `CLAUDE.md` del repo: qué es cada servicio, comandos, reglas (repo público, contrato de la
      plataforma, leer `docs/plan/` antes de cada fase, versiones verificadas en su fuente).
- [ ] ADR 0001–0011 (`02-arquitectura.md` §2.10).
- [ ] `ci.yml` inicial (lint, tipos, pruebas vacías), plantilla de PR con la lista de «Hecho», Renovate o Dependabot.
- [ ] `README.md` del repo: conservar el contrato y añadir «Desarrollo local».

**Aceptación:** `pnpm install`, `pnpm lint`, `pnpm typecheck` y `go build ./...` sin errores; CI verde.

## F1 · Esqueleto desplegable — M · Opus 5.5 `high`

**Objetivo:** cumplir el contrato de la plataforma con servicios mínimos y el arnés de escenarios en marcha.

- [ ] `gateway` desde la plantilla con las rutas de `02-arquitectura.md` §2.8, `/healthz`, `/version.json`,
      IP real, límites y cabeceras (§8.5).
- [ ] Imagen `postgres` con roles, esquemas, `btree_gist` y `postgresql.conf` (§8.6).
- [ ] `web`: React Router 8 SSR, middleware de idioma por `Host`, `/healthz`, portada provisional en es y en
      con `lang`, `hreflang`, `canonical` y CSP con nonce.
- [ ] `api`: NestJS 12 + Fastify, configuración validada, Drizzle y primera migración, `/api/healthz` con
      revisión, logs pino.
- [ ] `calendar`: `serve`, `migrate` y `healthcheck`; goose; `/healthz` y `/readyz`.
- [ ] `compose.yml` (desarrollo con `develop.watch` y Mailpit), `compose.prod.yml` (§8.3) y `compose.ci.yml`.
- [ ] `deploy.yml`: pruebas → publicar 5 imágenes → Coolify → comprobar `/version.json` y `/api/healthz`.
- [ ] Arnés de escenarios: playwright-bdd, actores, dominios locales, Mailpit, informes; escenarios `@humo`
      de salud, versión e idioma por dominio.

**Aceptación:** `docker compose up --watch` funciona; `docker compose -f compose.prod.yml config` valida con
variables ficticias; CI construye las 5 imágenes sin vulnerabilidades críticas; `@humo` en verde; consumo en
reposo dentro de los límites (`docker stats`).

## F2 · Contratos y comunicación interna — M · Opus 5.5 `xhigh`

**Objetivo:** `api` y `calendar` hablan de forma tipada, autenticada y sin perder eventos.

- [ ] `.proto` de `mcet.calendar.v1` y `mcet.api.v1` (`EventIngress`); `buf lint` y `buf breaking` en CI;
      código Go y TS generado y versionado.
- [ ] JWT interno HS256 con actor en ambos sentidos (interceptores Connect); mapeo de errores Connect ↔
      `problem+json`.
- [ ] River en `calendar`; job `deliver_domain_event`; `EventIngress.Publish` en `api:3001` con
      `inbound_events` para deduplicar.
- [ ] Propagación de `X-Request-Id` (gateway → api → calendar → api). El SDK de OpenTelemetry y su exportador se
      completan en F12, cuando haya un colector donde enviarlas.
- [ ] `TEST_MODE`: reloj controlable y semillas (`/__test/*`), con el bloqueo de arranque en dominios reales.

**Aceptación:** prueba de integración `api` → `calendar` con actor; un evento publicado llega una sola vez
aunque se reintente; JWT caducado o ausente rechazado; escenario: los puertos 3001 y 8081 no son alcanzables
por el gateway.

## F3 · Identidad, organizaciones y roles — L · Opus 5.5 `xhigh`

**Objetivo:** RF-01, RF-02, RF-08, RF-09 y la base de RF-10.

- [ ] Better Auth por dominio: correo y contraseña (Argon2id, HIBP), verificación obligatoria (enlace y
      código), Google, vinculación de cuentas, sesiones `__Host-`, `bearer` para el embed, `emailOTP` para
      clientes finales, 2FA opcional.
- [ ] Validación de correo completa (`05-negocio-api.md` §5.3).
- [ ] Organizaciones con plan elegido y prueba de 30 días; `calendar_members`; invitaciones (editor solo con
      Google y mismo correo; observador con cualquier método); `customer_links`.
- [ ] Guardas, decoradores y la matriz de permisos con pruebas generadas (§9.4).
- [ ] ALTCHA, límites de peticiones, comprobación de `Origin`, auditoría.
- [ ] Correos de verificación, invitación y recuperación (React Email, es y en, SMTP del idioma).
- [ ] Exportar y borrar cuenta.

**Aceptación:** escenarios de registro (correo y Google), verificación obligatoria, correo inválido o
desechable, sesión por dominio, invitación de editor con correo coincidente y no coincidente, observador en
solo lectura; matriz de permisos en verde.

## F4 · Motor: tableros, horarios, feriados y disponibilidad — L · Opus 5.5 `xhigh`

**Objetivo:** RF-05 y RF-06 en el motor, y disponibilidad correcta siempre (RNF-10).

- [ ] Migraciones: `org_status`, `calendars`, `hours`, `date_overrides`, `holiday_policies`,
      `custom_holidays`, `services`.
- [ ] `tools/holidays-gen` + datos embebidos por país con carga perezosa + `holidays-refresh.yml` + atribución.
- [ ] `availability.Compute` pura; corredor de escenarios YAML con ≥ 40 casos (§9.3); pruebas de propiedades.
- [ ] RPC de `CalendarService`, `ScheduleService`, `ServiceCatalogService` y `AvailabilityService`.
- [ ] Endpoints de `api` para tableros, ajustes, servicios, feriados y disponibilidad, con límite del plan.

**Aceptación:** escenarios YAML y de cambio de horario en verde; p95 < 50 ms dentro del motor para 31 días
(benchmark); Personal no pasa de 1 tablero y Sucursales de 10.

## F5 · Motor: eventos, recurrencia, reservas y concurrencia — XL · Opus 5.5 `xhigh`

**Objetivo:** RF-10, RF-11, RF-12 y la garantía contra la doble reserva.

- [x] `series` y `events` con la restricción `EXCLUDE` por asiento y bloqueo consultivo por tablero.
- [x] Subconjunto RRULE (parseo, validación, expansión en hora de pared) + pruebas diferenciales con
      `rrule-go` y ejemplos del RFC 5545.
- [x] Eventos con alcance `this`/`following`/`all`, conflictos (`abort`/`skip`), materialización a 18 meses y
      `extend_series`.
- [x] Holds, confirmación con revalidación, liberación, reprogramación atómica, cancelación con política,
      idempotencia y concurrencia optimista.
- [x] Visibilidad del actor `customer`; prohibido crear series; marcar asistencia; `StatsService`.
- [x] Eventos de dominio para todo cambio; `RenderICS`.
- [x] Endpoints del panel y de la API pública del embed (OTP, ALTCHA, `Idempotency-Key`).

**Aceptación:** prueba de 50 reservas simultáneas; escenarios de serie semanal con «este y los siguientes»,
bloqueo, hold que caduca, cliente que no ve a otros y que no puede crear series.

## F6 · Frontend base en español e inglés — L · Opus 5.5 `high`

**Objetivo:** RF-16, RF-20 y la base de RF-17.

- [x] Tokens de diseño (paleta, tipografía, modo oscuro) y componentes base (`07-frontend.md` §7.7).
- [x] `packages/i18n`: catálogos es/en tipados, comprobación en CI, mapa de rutas, `hreflang`, `canonical`,
      `x-default`, `sitemap.xml` y `robots.txt` por dominio, selector de idioma sin redirección.
- [x] Páginas públicas en los dos idiomas: inicio, funciones, precios, preguntas frecuentes, «Conecta tu IA»
      (contenido final en F11), contacto con newsletter, privacidad, condiciones, créditos, 404 y 500.
- [x] Páginas de acceso conectadas a F3.
- [x] CSP con nonce y cabeceras por ruta; Umami.

**Aceptación:** escenario de idiomas y SEO en los dos dominios; axe sin violaciones serias; presupuestos de
rendimiento de §7.9 en páginas públicas; ningún texto fuera de los catálogos.

## F7 · Panel, reserva, «Mis citas» y embed — XL · Opus 5.5 `high`

**Objetivo:** RF-05 a RF-12 y RF-17 en la interfaz.

- [x] Asistente de alta (plan, tablero, horario y descansos, feriados con vista previa, servicio, compartir).
- [x] Panel: inicio, calendario adaptable con FullCalendar 7, editor de eventos con recurrencia y alcance,
      bloqueos, conflictos, tiempo real por SSE.
- [x] Ajustes del tablero, equipo (invitar y quitar), clientes y asistencia.
- [x] Página de reserva, «Mis citas» y embed (iframe, `embed.js` con modos, altura automática, eventos al
      anfitrión, token Bearer en el iframe).
- [x] Campana de avisos (la alimenta F8).
- [x] Capturas visuales en 360, 768, 1024 y 1440 px (escenario `@capturas`; pendientes de aprobación del usuario).
- [ ] «Continuar con Google» en la verificación del cliente final (ventana emergente): pendiente; hoy solo código por correo.

**Aceptación:** escenarios de reserva en móvil, serie semanal, bloqueo, «Mis citas» y embed en es y en;
capturas aprobadas; axe sin violaciones serias.

## F8 · Avisos multicanal y recordatorios — L · Opus 5.5 `high`

**Objetivo:** RF-13, RF-14 y RF-22.

- [x] Ingreso → difusión → destinatarios → preferencias → canales (`05-negocio-api.md` §5.6).
- [x] Correos de todos los eventos (es y en, `.ics`, `List-Unsubscribe`); bandeja del panel con SSE.
- [x] Telegram (enlace del bot), Slack (OAuth `incoming-webhook`) y WhatsApp (verificación, plantillas,
      cupo), activables por variable de entorno. WhatsApp queda **implementado y desactivado, sin valores
      reales** (decisión del 2026-10-06), probado contra el servidor de captura.
- [x] Recordatorios a 24 h y 1 h; registro de entregas; reintentos; aviso si un canal falla.
- [x] Pantalla de preferencias.

**Aceptación:** escenarios de aviso a propietario y observadores en su idioma, vinculación de Telegram,
recordatorios con reloj controlado, sin aviso al autor y un solo aviso por cambio de serie.

## F9 · Planes, prueba gratuita y facturación (Stripe listo, sin configurar) — L · Opus 5.5 `xhigh`

**Objetivo:** RF-03 y RF-04. Solo suscripción; Stripe implementado completo pero **sin configurar y sin
valores reales** (decisión del 2026-10-06).

- [x] Script de Stripe por `lookup_key`; Embedded Checkout con días de prueba restantes; webhooks
      idempotentes que releen la suscripción.
- [x] Máquina de estados de la organización y efectos de `read_only` en `api`, `calendar` y `web`.
- [x] Cambio de plan (bajar exige un solo tablero activo), cancelar y reanudar, método de pago, facturas.
- [x] Avisos de fin de prueba (7 y 3 días) y de pago fallido; Stripe Tax con interruptor apagado.
- [x] CSP y `Permissions-Policy` de las rutas de facturación, aplicadas solo con Stripe activo.
- [x] Modo sin Stripe (`05-negocio-api.md` §5.5): «Disponible pronto», la prueba no vence, límites del plan
      aplicados, script `org:set-plan`.
- [x] Procedimiento «Activar Stripe» en `docs/operacion.md` y script `billing:activate`.

**Aceptación:** escenario `@humo` sin Stripe (como producción); con `stripe-mock`, escenarios de contratar
Personal, pago fallido → solo lectura, prueba vencida y bajada de plan; reenvío de webhooks sin efectos
dobles; eventos fuera de orden bien resueltos; ninguna clave real en el repositorio ni en CI.

## F10 · Sincronización con Google, Outlook y Apple — XL · Opus 5.5 `xhigh`

**Objetivo:** RF-15 (`04-motor-calendario.md` §4.9).

- [x] Nivel 1: feeds ICS de tablero y de cliente final, tokens revocables, instrucciones `webcal://`,
      botones «Añadir al calendario».
- [x] Google: OAuth incremental en `api`, credenciales cifradas en `calendar`, calendario de la app,
      `freebusy`, escritura, canal `watch` + `syncToken`, política de fuente de verdad.
- [x] Microsoft: OAuth `common`, `getSchedule`/`calendarView`, calendario propio, suscripciones + `delta`.
- [x] iCloud: contraseña de app, descubrimiento CalDAV, ocupado con sus tres alternativas, `PUT`, sondeo.
- [x] Reconciliación cada 15 min, salud de conexiones, «Reconectar», clasificación de errores.
- [x] Dobles de Google y Graph, Radicale en pruebas; guion y vídeo para la verificación de Google.

**Aceptación:** escenarios de ocupado externo que bloquea, reserva que aparece en el calendario de la app,
cambio externo restaurado, credencial revocada y contenido de los feeds.

## F11 · MCP: conecta tu IA — L · Opus 5.5 `xhigh`

**Objetivo:** RF-18 (`06-mcp.md`).

- [x] Better Auth `oauth-provider` + `cimd` + `jwt` por dominio (sin `@better-auth/mcp`, ADR 0018); metadatos
      RFC 9728 y RFC 8414; DCR con límites; clientes estáticos para Gemini Enterprise; consentimiento en `web`.
- [x] Endpoint `/mcp` con el SDK v2 (rutas Fastify propias); todas las herramientas de §6.4 con
      anotaciones, `outputSchema`, `securitySchemes`, contenido no confiable marcado y enmascarado de datos.
- [x] Recursos, prompts, límites y auditoría.
- [x] Panel → IA y página «Conecta tu IA» con pasos por cliente; correo al conectar.
- [x] Pruebas de §6.6 (unitarias rol × herramienta, cliente MCP en las dos eras, escenarios de OAuth).
- [ ] Verificación manual con Claude, ChatGPT y Gemini CLI: necesita el despliegue público
      (`docs/mcp-verificacion.md`).

**Aceptación:** escenarios de MCP en verde; lista de verificación manual firmada; MCP Inspector sin errores.

## F12 · Endurecimiento y lanzamiento — L · Opus 5.5 `xhigh`

**Objetivo:** salir a producción con garantías.

- [x] Revisión de seguridad con ASVS 5.0 nivel 2; ZAP *baseline*; verificación de cabeceras y CSP; escaneo
      de secretos del historial (`docs/seguridad.md`). Pendiente: interfaz de verificación en dos pasos.
- [x] k6 con los límites de memoria; `docker stats` bajo carga; ajuste de PostgreSQL (`docs/carga.md`).
- [x] Catálogo completo de escenarios en verde (nocturno), capturas y accesibilidad (`nocturno.yml`).
- [x] Legales finales en es y en: privacidad (incluye MCP, IA de terceros y los encargados activos: Google,
      Microsoft, Apple, Slack, Telegram; Stripe y Meta se añaden al activarlos), condiciones y acuerdo de
      encargo de datos para negocios (anexo de las condiciones). Conviene la revisión de un abogado.
- [ ] Verificación de Google OAuth, verificación de editor en Microsoft, app de Slack distribuible, perfil
      del bot de Telegram. (Stripe y WhatsApp siguen sin configurar: se activan más adelante con su
      procedimiento.)
- [x] `docs/operacion.md`: desplegar, volver atrás, rotar secretos, incidentes, activar Stripe, activar
      WhatsApp. Las copias de seguridad son de la plataforma.
- [ ] (Opcional) Envío al directorio de apps de ChatGPT y al de conectores de Claude (`06-mcp.md` §6.7).
- [ ] Lista §8.13 completa, primer despliegue, `TRUSTED_PROXY_CIDR`, humo en producción. (Preparado:
      escenarios `@humo-produccion` y su paso en `deploy.yml`; el despliegue lo hace el equipo con Coolify.)

**Aceptación:** `/version.json` y `/api/healthz` con el SHA desplegado; `@humo-produccion` en verde; lista
§8.13 cerrada.

## F13 · Post-lanzamiento (opcional, priorizar con datos)

Cuando se decida: **activar Stripe** y **activar WhatsApp** con sus procedimientos (solo configuración,
el código ya está). Ideas de DayOtter (`11-dayotter.md`): aviso «voy tarde», horarios recomendados, panel
de analítica y CSV, reparto entre profesionales de una sucursal. Además: API pública v1 con claves y
webhooks salientes, MCP Apps, sincronización bidireccional completa, MCP para clientes finales, asistente
dentro de la app, passkeys, PWA, cobro por cita con Stripe Connect (pospuesto el 2026-10-06), páginas de
reserva indexables y francés de Canadá.
