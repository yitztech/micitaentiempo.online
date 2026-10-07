# 8. Infraestructura, Docker y despliegue

Producción sigue el contrato de la plataforma de yitztech al pie de la letra (GitHub Actions publica en
GHCR, Coolify descarga y arranca, el servidor nunca compila). Desarrollo local usa el mismo reparto de
servicios con recarga en caliente.

## 8.1 Contrato de la plataforma → implementación

| Requisito (README y requisitos de despliegue) | Cómo se cumple |
|---|---|
| `compose.prod.yml` en la raíz | §8.3 |
| Servicio `gateway` (nginx) en el puerto 80, único con dominio | `services/gateway`, basado en la plantilla |
| Sin `ports:` | Ningún servicio publica puertos en `compose.prod.yml` |
| `mem_limit` en todo servicio | §8.2 (total 1 312 MiB) |
| Imágenes `${IMAGE_PREFIX}-<servicio>:${IMAGE_TAG}`, sin `build:` | Cinco imágenes publicadas por `deploy.yml` |
| Configuración dentro de las imágenes; el compose no monta archivos del repo | nginx, `postgresql.conf` e init de PostgreSQL van en sus imágenes; lo variable, por entorno |
| `/healthz` → 200 y `/version.json` → `{"revision":"<sha>"}` | En el gateway, con `RELEASE_SHA` horneado en la imagen |
| `X-Forwarded-For` solo desde `TRUSTED_PROXY_CIDR` | `set_real_ip_from ${TRUSTED_PROXY_CIDR}` en nginx; las apps confían solo en el gateway |
| Variables obligatorias con `${VAR:?mensaje}` | En §8.3 |
| Workflow: pruebas → publicar (`main` y SHA) → webhook de Coolify → esperar el SHA | §8.9 |
| Idioma por dominio, `hreflang`, sesiones por dominio, correo por idioma | `07-frontend.md` §7.2 y `05-negocio-api.md` §5.2 |
| PostgreSQL en el compose con volumen con nombre | Servicio `postgres`, volumen `postgres-data` |
| Migraciones al arrancar o en un servicio de un solo uso, compatibles hacia atrás | Al arrancar cada servicio, con bloqueo consultivo; patrón expandir/contraer (§8.10) |
| Nada importante en el disco del contenedor | Contenedores `read_only` salvo gateway y postgres |
| Colas con `mem_limit` y que puedan perderse sin perder citas | No hay Redis: pg-boss y River viven en PostgreSQL (incluidas en la copia) |
| Repositorio público | `.gitignore` y `.dockerignore` de la plantilla; escaneo de secretos en CI |

## 8.2 Servicios y recursos

| Servicio | `mem_limit` | `cpus` | Healthcheck | Notas |
|---|---|---|---|---|
| `gateway` | 64m | 0.25 | `wget http://127.0.0.1/healthz` | Espera a que `web`, `api` y `calendar` estén sanos, así `/version.json` solo responde con todo listo |
| `web` | 192m | 0.5 | `wget http://127.0.0.1:3000/healthz` | `--max-old-space-size=128` |
| `api` | 384m | 1.0 | `wget http://127.0.0.1:3000/api/healthz` | `--max-old-space-size=256` |
| `calendar` | 160m | 0.5 | `/calendar healthcheck` | `GOMEMLIMIT=120MiB` |
| `postgres` | 512m | 1.0 | `pg_isready` | `shared_buffers=128MB`, `max_connections=60` |
| **Total** | **1 312 MiB** | | | Umbral de revisión de la plataforma: 1,5 GB |

Conexiones a PostgreSQL: `api` 15 + pg-boss 5 + `calendar` 10 + River 5 + copias y administración 5 = 40 de 60.

## 8.3 `compose.prod.yml`

Punto de partida (F1 lo completa; los nombres de variables son los de §8.8):

```yaml
# PRODUCCIÓN en Coolify. Contrato: docs/plan/08-infraestructura.md §8.1
x-hardening: &hardening
  restart: unless-stopped
  security_opt: [no-new-privileges:true]
  cap_drop: [ALL]
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "3" }

x-site: &site
  IDIOMAS: ${IDIOMAS:-es,en}
  SITE_URL: ${SITE_URL:?Define SITE_URL}
  SITE_URL_ES: ${SITE_URL_ES:-}
  SITE_URL_EN: ${SITE_URL_EN:?Define SITE_URL_EN}

services:
  gateway:
    <<: *hardening
    image: ${IMAGE_PREFIX:?Define IMAGE_PREFIX, p. ej. ghcr.io/yitztech/micitaentiempo.online}-gateway:${IMAGE_TAG:-main}
    cap_add: [CHOWN, SETGID, SETUID, NET_BIND_SERVICE]   # nginx arranca como root y baja de usuario
    mem_limit: 64m
    cpus: 0.25
    environment:
      TRUSTED_PROXY_CIDR: ${TRUSTED_PROXY_CIDR:?Define la subred de Traefik}
    depends_on:
      web: { condition: service_healthy }
      api: { condition: service_healthy }
      calendar: { condition: service_healthy }
    healthcheck:
      test: [CMD, wget, -q, -O, /dev/null, "http://127.0.0.1/healthz"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks: [frontend]

  web:
    <<: *hardening
    image: ${IMAGE_PREFIX:?Define IMAGE_PREFIX}-web:${IMAGE_TAG:-main}
    read_only: true
    tmpfs: [/tmp]
    mem_limit: 192m
    cpus: 0.5
    environment:
      <<: *site
      NODE_OPTIONS: --max-old-space-size=128
      API_INTERNAL_URL: http://api:3000
      UMAMI_SCRIPT_URL: ${UMAMI_SCRIPT_URL:-}
      UMAMI_WEBSITE_ID: ${UMAMI_WEBSITE_ID:-}
      STRIPE_PUBLISHABLE_KEY: ${STRIPE_PUBLISHABLE_KEY:-}
    healthcheck:
      test: [CMD, wget, -q, -O, /dev/null, "http://127.0.0.1:3000/healthz"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks: [frontend]

  api:
    <<: *hardening
    image: ${IMAGE_PREFIX:?Define IMAGE_PREFIX}-api:${IMAGE_TAG:-main}
    read_only: true
    tmpfs: [/tmp]
    mem_limit: 384m
    cpus: 1.0
    environment:
      <<: *site
      NODE_OPTIONS: --max-old-space-size=256
      DB_HOST: postgres
      DB_NAME: micita
      DB_USER: api
      DB_PASSWORD: ${API_DB_PASSWORD:?Define API_DB_PASSWORD}
      CALENDAR_RPC_URL: http://calendar:8081
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Define BETTER_AUTH_SECRET}
      APP_ENC_KEY: ${APP_ENC_KEY:?Define APP_ENC_KEY}
      ALTCHA_HMAC_KEY: ${ALTCHA_HMAC_KEY:?Define ALTCHA_HMAC_KEY}
      RPC_SECRET_API_TO_CALENDAR: ${RPC_SECRET_API_TO_CALENDAR:?Define RPC_SECRET_API_TO_CALENDAR}
      RPC_SECRET_CALENDAR_TO_API: ${RPC_SECRET_CALENDAR_TO_API:?Define RPC_SECRET_CALENDAR_TO_API}
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:?Define TELEGRAM_WEBHOOK_SECRET}
      SMTP_HOST: ${SMTP_HOST:?Define SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:?Define SMTP_PORT}
      SMTP_SECURE: ${SMTP_SECURE:-true}
      SMTP_USER: ${SMTP_USER:?Define SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD:?Define SMTP_PASSWORD}
      MAIL_FROM: ${MAIL_FROM:?Define MAIL_FROM}
      SMTP_USER_EN: ${SMTP_USER_EN:?Define SMTP_USER_EN}
      SMTP_PASSWORD_EN: ${SMTP_PASSWORD_EN:?Define SMTP_PASSWORD_EN}
      MAIL_FROM_EN: ${MAIL_FROM_EN:?Define MAIL_FROM_EN}
      LISTMONK_URL: ${LISTMONK_URL:-}
      LISTMONK_LIST_UUID: ${LISTMONK_LIST_UUID:-}
      LISTMONK_URL_EN: ${LISTMONK_URL_EN:-}
      LISTMONK_LIST_UUID_EN: ${LISTMONK_LIST_UUID_EN:-}
      # Claves de terceros: vacías = función desactivada (permite desplegar antes de tenerlas)
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      MS_CLIENT_ID: ${MS_CLIENT_ID:-}
      MS_CLIENT_SECRET: ${MS_CLIENT_SECRET:-}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:-}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:-}
      STRIPE_TAX_ENABLED: ${STRIPE_TAX_ENABLED:-false}
      SLACK_CLIENT_ID: ${SLACK_CLIENT_ID:-}
      SLACK_CLIENT_SECRET: ${SLACK_CLIENT_SECRET:-}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_BOT_USERNAME: ${TELEGRAM_BOT_USERNAME:-}
      WHATSAPP_TOKEN: ${WHATSAPP_TOKEN:-}
      WHATSAPP_PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID:-}
      WHATSAPP_APP_SECRET: ${WHATSAPP_APP_SECRET:-}
      WHATSAPP_VERIFY_TOKEN: ${WHATSAPP_VERIFY_TOKEN:-}
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: [CMD, wget, -q, -O, /dev/null, "http://127.0.0.1:3000/api/healthz"]
      interval: 15s
      timeout: 5s
      retries: 10
    networks: [frontend, backend]

  calendar:
    <<: *hardening
    image: ${IMAGE_PREFIX:?Define IMAGE_PREFIX}-calendar:${IMAGE_TAG:-main}
    read_only: true
    mem_limit: 160m
    cpus: 0.5
    environment:
      GOMEMLIMIT: 120MiB
      PUBLIC_URL_ES: ${SITE_URL:?Define SITE_URL}
      PUBLIC_URL_EN: ${SITE_URL_EN:?Define SITE_URL_EN}
      DB_HOST: postgres
      DB_NAME: micita
      DB_USER: calendar
      DB_PASSWORD: ${CALENDAR_DB_PASSWORD:?Define CALENDAR_DB_PASSWORD}
      API_RPC_URL: http://api:3001
      RPC_SECRET_API_TO_CALENDAR: ${RPC_SECRET_API_TO_CALENDAR:?Define RPC_SECRET_API_TO_CALENDAR}
      RPC_SECRET_CALENDAR_TO_API: ${RPC_SECRET_CALENDAR_TO_API:?Define RPC_SECRET_CALENDAR_TO_API}
      CALENDAR_TOKEN_ENC_KEY: ${CALENDAR_TOKEN_ENC_KEY:?Define CALENDAR_TOKEN_ENC_KEY}
      GOOGLE_CHANNEL_SECRET: ${GOOGLE_CHANNEL_SECRET:?Define GOOGLE_CHANNEL_SECRET}
      MS_CLIENT_STATE_SECRET: ${MS_CLIENT_STATE_SECRET:?Define MS_CLIENT_STATE_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      MS_CLIENT_ID: ${MS_CLIENT_ID:-}
      MS_CLIENT_SECRET: ${MS_CLIENT_SECRET:-}
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: [CMD, /calendar, healthcheck]
      interval: 15s
      timeout: 5s
      retries: 10
    networks: [frontend, backend]

  # El backup de la plataforma vuelca cada contenedor PostgreSQL en marcha.
  postgres:
    image: ${IMAGE_PREFIX:?Define IMAGE_PREFIX}-postgres:${IMAGE_TAG:-main}
    restart: unless-stopped
    security_opt: [no-new-privileges:true]
    mem_limit: 512m
    cpus: 1.0
    environment:
      POSTGRES_DB: micita
      POSTGRES_USER: micita
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Define POSTGRES_PASSWORD}
      API_DB_PASSWORD: ${API_DB_PASSWORD:?Define API_DB_PASSWORD}
      CALENDAR_DB_PASSWORD: ${CALENDAR_DB_PASSWORD:?Define CALENDAR_DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql   # PostgreSQL 18: se monta en /var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U micita -d micita"]
      interval: 10s
      timeout: 5s
      retries: 20
    networks: [backend]

volumes:
  postgres-data:

networks:
  frontend:
  backend:
    internal: true   # sin salida a internet: solo api y calendar ↔ postgres
```

## 8.4 Imágenes

Todas se construyen desde la raíz del repo (`docker build -f services/<servicio>/Dockerfile .`), con
`# syntax=docker/dockerfile:1`, cachés de BuildKit, usuario no root y `ARG RELEASE_SHA`.

| Imagen | Construcción | Ejecución |
|---|---|---|
| `gateway` | Plantilla de yitztech: `nginx:1.30.5-alpine`, plantillas de configuración con `envsubst` para `TRUSTED_PROXY_CIDR` y `RELEASE_SHA` | nginx |
| `web` | `node:24.21.0-alpine3.24` + pnpm 12.9.1: `pnpm fetch`, instalación filtrada, `react-router build`, `pnpm deploy --prod` | `node` con `@react-router/serve`, usuario `node` |
| `api` | Igual que `web`; `nest build` | `node dist/main.js`, usuario `node` |
| `calendar` | `golang:1.27.1-alpine3.24`, `CGO_ENABLED=0`, `-trimpath`, `-ldflags "-s -w -X main.revision=${RELEASE_SHA}"` | `gcr.io/distroless/static-debian13:nonroot`; zonas del sistema + `time/tzdata` de respaldo |
| `postgres` | `postgres:18.6-alpine3.24` + `postgresql.conf` + scripts de `docker-entrypoint-initdb.d` | PostgreSQL |

Imagen de `calendar` como referencia:

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.27.1-alpine3.24 AS build
WORKDIR /src
COPY services/calendar/go.mod services/calendar/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY services/calendar/ ./
ARG RELEASE_SHA=dev
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.revision=${RELEASE_SHA}" \
    -o /out/calendar ./cmd/calendar

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/calendar /calendar
EXPOSE 8080 8081
ENTRYPOINT ["/calendar"]
CMD ["serve"]
```

El código generado (protobuf, Connect, sqlc) se versiona: las imágenes no necesitan `buf` ni `sqlc`, y CI
comprueba que está al día.

## 8.5 Gateway

Se parte de `gateway/` de la plantilla y se añade:

- `upstream` con `resolve` para `web:3000`, `api:3000` y `calendar:8080` (el DNS de Docker cambia la IP al
  recrear contenedores).
- Las rutas de `02-arquitectura.md` §2.8.
- `limit_req_zone` por IP real como límite exterior (los finos los aplica `api`, `05-negocio-api.md` §5.8):
  `auth` (10 r/min), `public` (120 r/min), `mcp` (120 r/min), `ics` (30 r/min).
- SSE (`/api/v1/stream`) y MCP (`/mcp`): `proxy_buffering off`, `proxy_read_timeout` de 1 h y 5 min.
- Webhooks: `client_max_body_size 1m`; resto 256k (logotipos: 512k en su ruta).
- Microcaché de páginas públicas (`proxy_cache` con clave `$host$request_uri`, 60 s, 20 MB en disco), nunca
  para respuestas con `Set-Cookie` ni rutas del panel.
- `X-Request-Id` (`$request_id`) hacia los servicios y en el log JSON de acceso.
- **Cabeceras:** el gateway pone HSTS, `X-Content-Type-Options` y `Referrer-Policy`. CSP,
  `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy` y COOP las pone cada servicio, porque dependen
  de la página (nonce, embed, Stripe). La inserción de Umami por `sub_filter` de la plantilla se sustituye
  por la de `web` (`07-frontend.md` §7.12).

## 8.6 Imagen de PostgreSQL

`services/postgres/initdb/00-roles.sh` (solo se ejecuta con el volumen vacío):

```sh
#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -v api_pw="$API_DB_PASSWORD" -v cal_pw="$CALENDAR_DB_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE ROLE api LOGIN PASSWORD :'api_pw';
CREATE ROLE calendar LOGIN PASSWORD :'cal_pw';
GRANT CONNECT ON DATABASE :"db" TO api, calendar;
-- El migrador de Drizzle ejecuta CREATE SCHEMA IF NOT EXISTS, que exige CREATE en la base.
GRANT CREATE ON DATABASE :"db" TO api;
CREATE SCHEMA app AUTHORIZATION api;
CREATE SCHEMA pgboss AUTHORIZATION api;
CREATE SCHEMA calendar AUTHORIZATION calendar;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER ROLE api SET search_path = app;
ALTER ROLE calendar SET search_path = calendar;
SQL
```

`postgresql.conf` para 512 MB: `listen_addresses='*'`, `max_connections=60`, `shared_buffers=128MB`,
`effective_cache_size=256MB`, `work_mem=4MB`, `maintenance_work_mem=32MB`, `wal_buffers=4MB`,
`jit=off`, `timezone='UTC'`, `idle_in_transaction_session_timeout=60s`,
`log_min_duration_statement=500ms`, `password_encryption=scram-sha-256`.

Cambiar contraseñas de roles más adelante es manual (`ALTER ROLE`), documentado en `docs/operacion.md`.

## 8.7 Desarrollo local

`compose.yml` (nombre por defecto de Compose) levanta lo mismo que producción, más herramientas:

| Servicio | Diferencia con producción |
|---|---|
| `gateway` | Puerto `8080:80`; `TRUSTED_PROXY_CIDR=0.0.0.0/0` |
| `web` | Servidor de desarrollo de React Router con HMR; `develop.watch` sincroniza `services/web` y `packages/*` |
| `api` | `nest start --watch`; `develop.watch` con `sync` del código y `rebuild` si cambia `package.json` o el lockfile |
| `calendar` | `develop.watch` con `rebuild` al cambiar código Go |
| `postgres` | Misma imagen; puerto `5432:5432` para herramientas locales |
| `mailpit` | `axllent/mailpit:v1.31.4`; todos los correos de los dos idiomas; interfaz en `:8025` |
| `stripe-cli` | Perfil `stripe`: `stripe listen --forward-to http://gateway/api/webhooks/stripe` |
| Dobles de pruebas | Perfil `fakes` (ver `09-pruebas.md` §9.2) |

Dominios locales: `http://micitaentiempo.localhost:8080` (es) y `http://myappointmentontime.localhost:8080`
(en); `HOST_LANG_MAP` los asocia a cada idioma. Si el cliente OAuth de Google de desarrollo no acepta
subdominios de `localhost`, se usan `http://localhost:8080` (es) y `http://127.0.0.1:8080` (en).

Comandos (documentados en el `README.md` del repo en F0):

```bash
pnpm install
cp .env.example .env            # valores ficticios; nunca se sube .env
docker compose up --watch       # todo el sistema con recarga
pnpm db:seed                    # negocio de ejemplo con tableros, miembros, citas y clientes
pnpm test                       # unitarias e integración (TS) ; en services/calendar: go test ./...
pnpm escenarios                 # pruebas por escenarios (09-pruebas.md)
pnpm lint && pnpm typecheck
```

## 8.8 Variables y secretos

| Variable | Servicios | Origen | Obligatoria |
|---|---|---|---|
| `SITE_URL`, `SITE_URL_ES`, `SITE_URL_EN`, `IDIOMAS` | web, api, calendar | Plataforma | `SITE_URL` y `SITE_URL_EN` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER[_EN]`, `SMTP_PASSWORD[_EN]`, `MAIL_FROM[_EN]` | api | Plataforma | Sí |
| `LISTMONK_URL[_EN]`, `LISTMONK_LIST_UUID[_EN]` | api | Plataforma | No |
| `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID` | web | Plataforma | No |
| `TRUSTED_PROXY_CIDR` | gateway | Plataforma (medida tras el primer arranque) | Sí |
| `IMAGE_PREFIX`, `IMAGE_TAG` | todos | Plataforma | `IMAGE_PREFIX` |
| `POSTGRES_PASSWORD`, `API_DB_PASSWORD`, `CALENDAR_DB_PASSWORD` | postgres, api, calendar | Generada por la plataforma | Sí |
| `BETTER_AUTH_SECRET`, `APP_ENC_KEY`, `ALTCHA_HMAC_KEY` | api | Generada | Sí |
| `RPC_SECRET_API_TO_CALENDAR`, `RPC_SECRET_CALENDAR_TO_API` | api, calendar | Generada | Sí |
| `CALENDAR_TOKEN_ENC_KEY`, `GOOGLE_CHANNEL_SECRET`, `MS_CLIENT_STATE_SECRET` | calendar | Generada | Sí |
| `TELEGRAM_WEBHOOK_SECRET` | api | Generada | Sí |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | api, calendar | Tercero (Google Cloud), canal seguro | No (sin ellas, no hay Google) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | api, calendar | Tercero (Microsoft Entra) | No |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_TAX_ENABLED` | api, web | Tercero (Stripe). **Sin configurar por ahora** (decisión del 2026-10-06): vacías en producción | No (sin ellas, «Contratar» muestra «Disponible pronto» y la prueba no vence) |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | api | Tercero (Slack) | No |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | api | Tercero (BotFather) | No |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | api | Tercero (Meta). **Sin configurar por ahora** (decisión del 2026-10-06): vacías en producción | No (sin ellas, el canal no aparece) |

Los secretos generados deben tener al menos 32 bytes aleatorios. `.env.example` lista todas: los secretos
propios con valores ficticios de desarrollo y las claves de terceros **vacías**. Ningún valor real entra en
el repositorio.

## 8.9 CI/CD

| Workflow | Disparo | Trabajos |
|---|---|---|
| `ci.yml` | PR, push a ramas que no son `main`, y `workflow_call` | **ts:** Biome, claves i18n, tipos, Vitest con cobertura. **go:** golangci-lint, `go test -race` (Testcontainers), `sqlc diff`, `buf lint` y `buf breaking` contra `main`, código generado al día. **imagenes:** `docker buildx bake` de las 5 imágenes sin publicar + Trivy (falla con críticas corregibles). **escenarios:** `compose.prod.yml` + `compose.ci.yml` con las imágenes recién construidas, escenarios `@humo` y `@critico`, informe como artefacto. **seguridad:** CodeQL (TS y Go) y `dependency-review-action` en PR |
| `deploy.yml` | Push a `main` (salvo `**/*.md`) y manual | `pruebas` (reutiliza `ci.yml`; si falla, no se publica nada) → `publicar` (matriz de 5 imágenes, etiquetas `main` y SHA, caché `gha`, `provenance` y SBOM, como la plantilla) → `desplegar` (entorno `production`, webhook de Coolify con `POST` y `Authorization: Bearer`, espera a que `/version.json` y `/api/healthz` devuelvan el SHA) → `humo` (escenarios de solo lectura `@humo-produccion` contra producción, opcional) |
| `nocturno.yml` | Cada día, 03:00 UTC | Todos los escenarios (es/en × móvil/tableta/escritorio), k6 de humo, evals MCP si existe la clave |
| `holidays-refresh.yml` | Cada 1 de octubre | Regenera los datos de feriados y abre un PR |
| Renovate o Dependabot | Semanal | Actualizaciones agrupadas por ecosistema (npm, gomod, docker, actions); nunca se fusionan solas (`main` exige aprobación) |

Cadena de suministro: lockfiles versionados; pnpm con `minimumReleaseAge: 1440` (no instala versiones con
menos de 24 h) y `onlyBuiltDependencies` explícito; acciones de GitHub fijadas por versión mayor oficial;
imágenes con SBOM y procedencia.

## 8.10 Migraciones, despliegues y vuelta atrás

- Cada servicio aplica sus migraciones al arrancar, bajo un bloqueo consultivo, antes de declararse sano.
- **Expandir/contraer:** una versión añade columnas o tablas compatibles; la siguiente deja de usar lo
  viejo; una tercera lo borra. Nunca se renombra ni se borra en el mismo despliegue que cambia el código.
- Coolify para y arranca los contenedores (~1 minuto de corte, según la plantilla): se despliega fuera de
  horas pico y la página de reserva muestra un aviso amable si `api` no responde.
- **Vuelta atrás:** PR de *revert* aprobado y fusionado (el despliegue es automático). Pedir a la plataforma
  si puede fijar `IMAGE_TAG` a un SHA anterior como vía rápida.

## 8.11 Copias de seguridad

Las copias y la seguridad del servidor las gestiona la plataforma con su propio sistema (confirmado por el
usuario el 2026-10-06); el proyecto no añade servicios de copia. Lo que sí hace el proyecto:

- Todo el estado durable vive en PostgreSQL (incluidas las colas), dentro del volumen `postgres-data`.
- La imagen propia de PostgreSQL es la oficial con configuración horneada: mismo binario y mismo
  `POSTGRES_USER`, así que se vuelca igual que una imagen `postgres` estándar.
- Opcional, post-lanzamiento: simulacro de restauración en local con un volcado y los escenarios de humo.

## 8.12 Observabilidad

- Logs JSON en los cuatro servicios (nginx con formato JSON) con `request_id` y, en las apps, `trace_id`.
- Trazas OpenTelemetry de `web` → `api` → `calendar` (propagación W3C y `otelconnect`); el exportador se
  activa solo si existe `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Métricas Prometheus en puertos internos (`calendar:8081/metrics`, `api:3001/metrics`).
- `/healthz` (vida) y `/readyz` (base de datos y migraciones) por servicio.
- Alertas: fallos de despliegue (GitHub), trabajos agotados en las colas y conexiones de calendario caídas
  (resumen diario por correo a `ALERT_EMAIL`); monitor externo de `/healthz` (preguntar a la plataforma).

## 8.13 Lista previa al primer despliegue

- [ ] Cuentas de GitHub de quien programe, con acceso a `yitztech`.
- [ ] Remitentes confirmados: «Mi Cita en Tiempo» y «My Appointment On Time».
- [ ] Buzones y alias por dominio; nombres de las listas de newsletter.
- [ ] `compose.prod.yml` y `deploy.yml` en `main` cumpliendo §8.1.
- [ ] Memoria por servicio comunicada (§8.2).
- [ ] Nombres de los secretos que debe generar la plataforma (§8.8, origen «Generada»).
- [ ] Archivos subidos: solo logotipos en PostgreSQL; ningún volumen de archivos.
- [ ] DayOtter: no se usa (decisión del estudio y de este plan).
- [ ] Claves de terceros entregadas por canal seguro: Google, Microsoft, Slack y Telegram. **Stripe y
      WhatsApp no se configuran por ahora** (decisión del 2026-10-06): sus variables quedan vacías.
- [ ] Orígenes de terceros para la CSP: Umami. Los de Stripe se añaden cuando se active.
- [ ] Páginas de privacidad y condiciones en los dos dominios.
- [ ] Cliente OAuth de Google con los dos orígenes y las dos URI de retorno (login y calendario).
- [ ] Webhook de Telegram registrado en el dominio principal.
- [ ] Tras el primer arranque: medir `TRUSTED_PROXY_CIDR` y ponerlo en la ficha del cliente.

Copias de seguridad y seguridad del servidor: a cargo de la plataforma (§8.11), sin tareas para el proyecto.
