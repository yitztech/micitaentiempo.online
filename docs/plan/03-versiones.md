# 3. Versiones

Foto verificada el **2026-10-06** en la fuente de cada componente (go.dev, nodejs.org, registro de npm,
proxy de módulos de Go, Docker Hub, gcr.io y releases de GitHub). Estable significa sin sufijos alpha,
beta, rc ni canary; para Node.js, la LTS activa.

**Regla para quien ejecute el plan:** al empezar cada fase, vuelve a comprobar las versiones de lo que
vayas a instalar (`npm view <paquete> version`, `go list -m -versions <módulo>`, Docker Hub, releases).
Si hay una más reciente y estable, úsala y actualiza esta tabla en el mismo PR. Si un paquete está atado a
otro (p. ej., `@nestjs/swagger` a TypeScript 6), usa la última compatible y anótalo.

## 3.1 Runtimes e imágenes base

| Componente | Versión | Imagen / fuente | Nota |
|---|---|---|---|
| Go | 1.27.1 | `golang:1.27.1-alpine3.24` (compilación) | [go.dev/dl](https://go.dev/dl/) |
| Node.js | 24.21.0 LTS «Krypton» | `node:24.21.0-alpine3.24` | Node 26 pasa a LTS el **2026-10-28**: cambiar entonces a `node:26-alpine` y `@types/node@26` en un PR propio ([calendario](https://github.com/nodejs/Release)) |
| PostgreSQL | 18.6 | `postgres:18.6-alpine3.24` como base de la imagen propia | PostgreSQL 19 aún no está publicado ([versiones](https://www.postgresql.org/support/versioning/)). En 18 el volumen se monta en `/var/lib/postgresql` |
| nginx | 1.30.5 (rama estable) | `nginx:1.30.5-alpine` | La plantilla usa la rama estable; la *mainline* es 1.31.6 |
| Distroless | `static-debian13:nonroot` | `gcr.io/distroless/static-debian13:nonroot` | Imagen final de `calendar` |
| Mailpit | v1.31.4 | `axllent/mailpit:v1.31.4` | Solo desarrollo y pruebas |
| Stripe CLI | v1.53.0 | `stripe/stripe-cli:v1.53.0` | Solo desarrollo |

## 3.2 Docker, CI y plataforma

| Componente | Versión |
|---|---|
| Docker Engine | 29.8.2 |
| Docker Compose | v5.6.0 |
| Docker Buildx | v0.37.2 |
| Coolify (plataforma) | v4.4.0 |
| `actions/checkout` | v7.0.1 |
| `docker/setup-buildx-action` | v4.4.1 |
| `docker/login-action` | v4.6.0 |
| `docker/build-push-action` | v7.4.0 |
| `docker/metadata-action` | v6.2.0 |
| `docker/bake-action` | v7.4.0 |
| `actions/setup-node` | v7.0.0 |
| `actions/setup-go` | v7.0.0 |
| `pnpm/action-setup` | v6.1.0 |
| `actions/cache` | v6.1.0 |
| `actions/upload-artifact` | v7.0.1 |
| `actions/dependency-review-action` | v5.0.0 |
| `golangci/golangci-lint-action` | v9.3.0 |
| `bufbuild/buf-action` | v1.6.0 |
| `aquasecurity/trivy-action` | v0.36.0 |
| `github/codeql-action` | bundle v2.27.1 (usar la etiqueta mayor vigente de la acción) |
| Renovate | 44.141.0 (alternativa a Dependabot) |

## 3.3 Motor de calendario (Go)

| Necesidad | Módulo | Versión |
|---|---|---|
| PostgreSQL | `github.com/jackc/pgx/v5` | v5.11.0 |
| Consultas | pgx directo con escaneo explícito (sqlc v1.31.1 descartado: exige cgo y apenas aporta con este número de consultas; ADR 0012) | — |
| Migraciones | `github.com/pressly/goose/v3` | v3.28.0 |
| Cola de trabajos | `github.com/riverqueue/river` (+ `riverdriver/riverpgxv5`) | v0.49.0 |
| RPC interno | `connectrpc.com/connect` | v1.21.0 |
| Trazas en RPC | `connectrpc.com/otelconnect` | v0.10.0 |
| Protobuf | `google.golang.org/protobuf` · `buf` | v1.36.12 · v1.73.0 |
| Google Calendar | `google.golang.org/api` (`calendar/v3`) | v0.300.0 |
| OAuth (refresco de tokens) | `golang.org/x/oauth2` | v0.37.0 |
| Microsoft Graph | Cliente REST propio sobre `net/http` | — (se descarta `msgraph-sdk-go` v1.104.0 por tamaño de binario y memoria) |
| CalDAV (iCloud) | `github.com/emersion/go-webdav` | v0.7.0 |
| iCalendar | `github.com/arran4/golang-ical` | v0.3.7 |
| JWT interno | `github.com/go-jose/go-jose/v4` | v4.1.5 |
| Observabilidad | `go.opentelemetry.io/otel` · `github.com/prometheus/client_golang` | v1.47.0 · v1.24.1 |
| Pruebas | `github.com/testcontainers/testcontainers-go` (+ `modules/postgres`) · `pgregory.net/rapid` | v0.44.0 · v1.3.0 |
| Escenarios YAML del motor | `go.yaml.in/yaml/v3` | última estable |
| Pruebas diferenciales de RRULE | `github.com/teambition/rrule-go` | v1.8.2 (solo en pruebas; sin cambios desde 2023) |
| Lint | `golangci-lint` | v2.14.0 |
| Feriados (descartado) | `github.com/rickar/cal/v2` | v2.1.32 — solo 45 países; ver `04-motor-calendario.md` §4.6 |

## 3.4 Negocio (NestJS)

| Paquete | Versión | Nota |
|---|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `@nestjs/testing` | 12.1.2 | NestJS 12: paquetes ESM, validación con Standard Schema (Zod) en `@Body`/`@Query`/`@Param` |
| `@nestjs/config` · `@nestjs/swagger` · `@nestjs/terminus` · `@nestjs/schedule` · `@nestjs/cli` | 12.0.1 · 12.0.2 · 12.1.0 · 12.0.2 · 12.0.8 | |
| `fastify` | 5.12.5 | |
| `@fastify/helmet` · `@fastify/cookie` · `@fastify/rate-limit` · `@fastify/cors` | 13.1.1 · 11.1.2 · 11.2.0 · 11.3.0 | |
| `typescript` (solo `services/api`) | **6.0.3** | Atado: la CLI de NestJS 12 aún no funciona con TypeScript 7 (falta la API programática de 7.1) y `@nestjs/swagger` declara `^5.5 \|\| ^6`. Subir a 7 cuando NestJS lo soporte |
| `@types/node` | 24.19.1 | Igual a la mayor de Node |
| `better-auth` · `@better-auth/oauth-provider` · `@better-auth/mcp` · `@better-auth/cimd` | 1.7.7 | Identidad y servidor OAuth 2.1 para MCP |
| `@thallesp/nestjs-better-auth` | 2.8.0 | Integración con NestJS 12 y Fastify |
| `drizzle-orm` · `drizzle-kit` · `drizzle-zod` | 0.45.3 · 0.31.11 · 0.8.3 | |
| `pg` | 8.23.1 | |
| `pg-boss` | 12.37.0 | Cola sobre PostgreSQL |
| `zod` | 4.6.5 | Compartido con el frontend |
| `stripe` | 23.0.0 | Fijar la `apiVersion` que trae el SDK |
| `nodemailer` | 10.0.15 | |
| `@react-email/components` · `@react-email/render` | 1.0.12 · 2.1.0 | Plantillas de correo en TSX |
| `@connectrpc/connect` · `@connectrpc/connect-node` · `@connectrpc/connect-fastify` | 2.2.0 | |
| `@bufbuild/protobuf` · `@bufbuild/protoc-gen-es` · `@bufbuild/buf` | 2.16.0 · 2.16.0 · 1.73.0 | |
| `pino` · `nestjs-pino` | 10.4.0 · 5.3.1 | |
| `@opentelemetry/sdk-node` | 0.223.0 | |
| `@node-rs/argon2` | 2.2.1 | 2.2.2 salió el 2026-10-06 y `minimumReleaseAge` la bloquea; subir en el siguiente PR |
| `altcha-lib` (servidor y navegador) | 2.6.0 | Antibots con prueba de trabajo, autoalojado, sin terceros; sin el widget `altcha` (ADR 0013) |
| `mailchecker` | 6.0.21 | Dominios de correo desechables |
| `libphonenumber-js` | 1.13.14 | Teléfonos E.164 para WhatsApp |
| `grammy` | 1.46.0 | Bot de Telegram |
| `@slack/web-api` | 8.2.0 | |
| `jose` | 6.2.12 | |
| `date-holidays` (herramienta de generación) | 3.37.0 | Licencia ISC (código) y CC-BY-3.0 (datos): exige atribución |

## 3.5 MCP

| Paquete / especificación | Versión | Nota |
|---|---|---|
| Especificación MCP | 2026-07-28 | Sin sesiones de protocolo; DCR obsoleto en favor de CIMD; `iss` (RFC 9207) |
| `@modelcontextprotocol/server` | 2.3.1 | SDK v2; atiende también a clientes de la era 2025 sin estado |
| `@modelcontextprotocol/fastify` | 2.0.1 | Adaptador para Fastify 5 |
| `@modelcontextprotocol/client` | 2.3.1 | Solo pruebas |
| `@modelcontextprotocol/ext-apps` | 2.0.3 | MCP Apps (interfaz interactiva), post-lanzamiento |

## 3.6 Frontend

| Paquete | Versión | Nota |
|---|---|---|
| `react` · `react-dom` | 19.3.0 | |
| `react-router` · `@react-router/dev` · `@react-router/node` · `@react-router/serve` | 8.4.0 | Modo framework; exige Node ≥ 22.22, React ≥ 19.2.7 y Vite ≥ 7 |
| `vite` | 8.3.2 | 8.3.3 salió el 2026-10-06 y `minimumReleaseAge` (24 h) la bloquea; subir en el siguiente PR |
| `typescript` (web y paquetes compartidos) | 7.0.2 | El código compartido debe compilar también con 6.0.3 (lo consume `api`) |
| `tailwindcss` · `@tailwindcss/vite` | 4.3.3 | |
| `shadcn` (CLI) · `radix-ui` | 4.21.3 · 1.7.0 | |
| `lucide-react` | 1.52.0 | |
| `@tanstack/react-query` | 5.104.1 | |
| `react-hook-form` · `@hookform/resolvers` | 7.89.0 · 5.9.1 | |
| `marked` | 18.1.0 | Legales en Markdown, convertidos en el servidor (i18next descartado: ADR 0013) |
| `@fullcalendar/core` · `@fullcalendar/react` (+ daygrid, timegrid, list, interaction) | 7.1.1 | Solo plugins MIT; nada de los premium |
| `temporal-polyfill` | 1.0.5 | |
| `@fontsource-variable/inter` | 5.3.0 | Fuente autoalojada |
| `@stripe/stripe-js` | 10.0.0 | Embedded Checkout y Payment Element |
| `isbot` | 5.2.2 | |

## 3.7 Pruebas y calidad

| Paquete | Versión |
|---|---|
| `@playwright/test` | 1.63.0 |
| `playwright-bdd` | 9.2.1 |
| `@axe-core/playwright` | 4.13.0 |
| `vitest` | 5.0.3 |
| `@testing-library/react` | 16.3.3 |
| `msw` | 3.0.2 |
| `testcontainers` · `@testcontainers/postgresql` | 12.2.0 |
| `@faker-js/faker` | 10.6.0 |
| `@biomejs/biome` | 2.5.15 |
| `pnpm` | 12.9.1 |
| k6 | Verificar la última versión del binario en [grafana/k6](https://github.com/grafana/k6/releases) al llegar a F12 |
