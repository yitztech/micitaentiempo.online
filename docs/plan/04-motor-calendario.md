# 4. Motor de calendario (`services/calendar`, Go)

El motor es la única pieza que decide sobre el tiempo: qué horarios están libres, qué se puede reservar,
cómo se repite una serie y qué se sincroniza con Google, Microsoft e iCloud. Es un servicio interno: solo
expone al exterior `/hooks/*` y `/ics/*`; todo lo demás llega desde `api` por Connect RPC con un actor
firmado.

## 4.1 Principios

1. **Funciones puras en el centro.** Disponibilidad, recurrencia y feriados son funciones sin E/S, con
   reloj inyectado. Todo lo demás (SQL, proveedores, colas) las rodea.
2. **PostgreSQL es el árbitro.** Ninguna doble reserva depende solo del código: la impide una restricción
   `EXCLUDE` y todas las escrituras que cambian la ocupación de un tablero se serializan con un bloqueo
   consultivo por tablero.
3. **Los efectos secundarios no rompen la reserva.** Avisos, sincronización y correos salen por River
   (outbox transaccional) con reintentos; si fallan, la reserva sigue confirmada.
4. **Hora de pared + zona para reglas; UTC para instantes.**
5. **Privacidad por defecto.** De calendarios externos solo se guarda «ocupado de X a Y», nunca títulos.

## 4.2 Estructura del código

```
services/calendar/
  cmd/calendar/main.go        # subcomandos: serve | migrate | healthcheck
  internal/config/            # variables de entorno validadas
  internal/clock/             # reloj real o controlado (solo con TEST_MODE)
  internal/db/                # migraciones goose embebidas, consultas sqlc, pool pgx
  internal/domain/            # tipos puros: Interval, Slot, WeeklyHours, Policy…
  internal/availability/      # cálculo de huecos (puro)
  internal/recurrence/        # subconjunto RRULE: parseo, validación, expansión (puro)
  internal/holidays/          # datos embebidos por país + evaluación de políticas (puro)
  internal/booking/           # holds, confirmación, reprogramación, concurrencia
  internal/events/            # eventos, series, ediciones por alcance
  internal/stats/             # métricas para panel y MCP
  internal/sync/              # google/, microsoft/, caldav/, ics/ + interfaz común Provider
  internal/outbox/            # eventos de dominio → job River → api
  internal/rpc/               # handlers Connect + interceptores (actor, OTel, logs, errores)
  internal/httpapi/           # /hooks, /ics, /healthz, /readyz, /metrics
  internal/jobs/              # workers y periódicos de River
  internal/crypto/            # AES-256-GCM con id de clave para tokens de proveedores
  gen/                        # código generado (protobuf/Connect, sqlc) — versionado
  testdata/escenarios/        # escenarios YAML del motor (09-pruebas.md §9.3)
```

Sin frameworks web: `net/http` con los patrones de rutas de la librería estándar, `log/slog` en JSON,
`GOMAXPROCS` automático según el cgroup (comportamiento por defecto desde Go 1.25).

## 4.3 Modelo de datos

La imagen de `postgres` crea el esquema `calendar`, el rol `calendar` y la extensión `btree_gist`. El
resto lo crean las migraciones de goose. Esquema base (las migraciones pueden afinar nombres y añadir
índices, sin cambiar las garantías):

```sql
create table calendar.org_status (
  org_id     uuid primary key,
  status     text not null check (status in ('trialing','active','past_due','read_only','suspended')),
  updated_at timestamptz not null default now()
);

create table calendar.calendars (
  id             uuid primary key default uuidv7(),
  org_id         uuid not null references calendar.org_status (org_id),
  slug           text not null unique check (slug ~ '^[a-z0-9](-?[a-z0-9])*$' and length(slug) between 3 and 60),
  name           text not null,
  timezone       text not null,                  -- IANA, validada con time.LoadLocation
  capacity       smallint not null default 1 check (capacity between 1 and 50),
  country        text,                           -- ISO 3166-1 alfa-2 de la sucursal
  subdivision    text,                           -- ISO 3166-2
  address        text,
  embed_policy   jsonb not null default '{"mode":"any"}',  -- any | allowlist {"origins":[…]}
  booking_policy jsonb not null default '{}',              -- p. ej. cancelar con 12 h de antelación
  status         text not null default 'active' check (status in ('active','archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table calendar.hours (                      -- horario laboral y descansos semanales
  id          uuid primary key default uuidv7(),
  calendar_id uuid not null references calendar.calendars on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- ISO 8601: 1 = lunes
  kind        text not null check (kind in ('open','break')),
  label       text,                                                -- «Desayuno», «Comida»
  start_local time not null,
  end_local   time not null check (end_local > start_local)        -- turnos nocturnos: dos filas
);

create table calendar.date_overrides (
  calendar_id uuid not null references calendar.calendars on delete cascade,
  date_local  date not null,
  kind        text not null check (kind in ('closed','custom','open_on_holiday')),
  intervals   jsonb,                               -- [{"start":"10:00","end":"14:00"}] si custom
  note        text,
  primary key (calendar_id, date_local)
);

create table calendar.holiday_policies (
  calendar_id uuid not null references calendar.calendars on delete cascade,
  country     text not null,                       -- MX, US, CA…
  subdivision text not null default '',            -- MX-CMX, US-TX, CA-QC o '' (nacional)
  types       text[] not null default '{public}',  -- public | bank | school | optional | observance
  substitutes boolean not null default true,       -- bloquear también el día trasladado
  primary key (calendar_id, country, subdivision)
);

create table calendar.custom_holidays (
  id          uuid primary key default uuidv7(),
  calendar_id uuid not null references calendar.calendars on delete cascade,
  name        text not null,
  date_local  date,                                -- fecha concreta…
  month_day   text,                                -- …o 'MM-DD' cada año
  check ((date_local is null) <> (month_day is null))
);

create table calendar.services (
  id                uuid primary key default uuidv7(),
  calendar_id       uuid not null references calendar.calendars on delete cascade,
  name              jsonb not null,                -- {"es":"Consulta general","en":"General consultation"}
  description       jsonb,
  duration_min      int not null check (duration_min between 5 and 720),
  buffer_before_min int not null default 0 check (buffer_before_min between 0 and 240),
  buffer_after_min  int not null default 0 check (buffer_after_min between 0 and 240),
  min_notice_min    int not null default 60,
  max_advance_days  int not null default 60 check (max_advance_days between 1 and 365),
  slot_step_min     int not null default 30 check (slot_step_min in (5,10,15,20,30,45,60,90,120)),
  daily_limit       int,
  color             text not null default 'laguna',
  active            boolean not null default true,
  position          int not null default 0
);

create table calendar.series (
  id                 uuid primary key default uuidv7(),
  calendar_id        uuid not null references calendar.calendars on delete cascade,
  kind               text not null check (kind in ('appointment','block')),
  rrule              text not null,                -- subconjunto RFC 5545, forma canónica
  dtstart_local      timestamp not null,           -- hora de pared
  tzid               text not null,
  duration           interval not null,
  until_utc          timestamptz,                  -- null = sin fin (se materializa por horizonte)
  exdates_local      timestamp[] not null default '{}',
  materialized_until timestamptz not null,
  template           jsonb not null,               -- título, servicio, asistente, notas…
  created_by         uuid not null,
  version            int not null default 1,
  created_at         timestamptz not null default now()
);

create table calendar.events (
  id               uuid primary key default uuidv7(),
  calendar_id      uuid not null references calendar.calendars on delete cascade,
  kind             text not null check (kind in ('appointment','block')),
  status           text not null check (status in ('held','confirmed','cancelled')),
  during           tstzrange not null check (not isempty(during) and lower_inc(during) and not upper_inc(during)),
  all_day          boolean not null default false,
  seat             smallint not null default 1,
  series_id        uuid references calendar.series on delete set null,
  recurrence_id    timestamptz,                    -- inicio original de la instancia
  is_exception     boolean not null default false, -- instancia modificada a mano
  service_id       uuid references calendar.services,
  title            text,
  customer_user_id uuid,                           -- cliente final (reservación)
  attendee         jsonb,                          -- {name,email,phone,locale,tz}: copia mínima
  customer_notes   text,                           -- escrito por el cliente final: NO CONFIABLE
  internal_notes   text,                           -- solo personal del negocio
  attendance       text check (attendance in ('attended','no_show')),
  created_by       uuid not null,
  created_via      text not null check (created_via in ('panel','embed','public','mcp','sync','system')),
  hold_expires_at  timestamptz,
  ical_uid         text not null unique,
  ical_sequence    int not null default 0,
  version          int not null default 1,         -- concurrencia optimista
  idempotency_key  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  cancel_reason    text,
  unique (calendar_id, idempotency_key),
  unique (series_id, recurrence_id)
);

-- Garantía final contra la doble reserva: por tablero y asiento (capacidad), sin solapes.
alter table calendar.events add constraint events_no_overlap
  exclude using gist (calendar_id with =, seat with =, during with &&)
  where (kind = 'appointment' and status in ('held','confirmed'));

create index events_calendar_during on calendar.events using gist (calendar_id, during)
  where status <> 'cancelled';
create index events_customer on calendar.events (customer_user_id, lower(during))
  where customer_user_id is not null;
```

Tablas de sincronización (§4.9): `connections` (proveedor, cuenta, credenciales cifradas, estado),
`external_calendars` (por conexión: usar como ocupado, destino de escritura, `sync_token`, canal y su
caducidad, `ctag`), `external_busy` (`tstzrange` + índice GiST), `external_links` (evento propio ↔ id y
`etag` en el proveedor) e `ics_feeds` (hash del token, alcance, revocación). River crea sus tablas en el
mismo esquema con `rivermigrate`.

## 4.4 Disponibilidad

`availability.Compute(input) → []Slot` es una función pura. Entradas: zona del tablero, capacidad,
horario semanal (abierto y descansos), excepciones por fecha, feriados ya resueltos, eventos que ocupan
(citas por asiento, bloqueos, holds vigentes), ocupado externo, parámetros del servicio, `now` y la zona
del visitante.

Pasos:

1. **Ventana.** `[max(desde, now + antelación mínima), min(hasta, now + ventana máxima)]`, como máximo
   62 días por petición.
2. **Base por día local** en la zona del tablero: intervalos `open` del día de la semana, o los de la
   excepción (`closed` deja el día vacío; `custom` lo reemplaza). Se restan los `break`.
3. **Feriados.** Un feriado bloquea el día local completo, salvo excepción `open_on_holiday`.
4. **Paso a UTC.** Cada intervalo local se convierte con la zona del tablero. Hora inexistente (salto de
   primavera): el límite se mueve a la primera hora válida posterior. Hora ambigua (otoño): se toma la
   primera aparición. Nunca se suma «24 h» para pasar de día: se avanza por fecha local.
5. **Ocupación.** Bloqueos y ocupado externo restan tiempo a todos los asientos; cada cita ocupa su
   asiento. Un horario es válido si queda al menos un asiento libre en
   `[inicio − margen_antes, inicio + duración + margen_después)`.
6. **Márgenes.** Cada cita existente ocupa su intervalo ampliado con los márgenes de su servicio, y cada
   candidato se amplía con los suyos. Los márgenes solo chocan con otras citas y bloqueos: pueden caer
   fuera del horario laboral o en un descanso. La cita en sí (sin márgenes) debe caber entera en tiempo
   abierto.
7. **Candidatos.** Inicios alineados al intervalo del servicio sobre el reloj local (con paso de 30 min:
   :00 y :30), desde el inicio de cada intervalo abierto.
8. **Límite diario** por servicio, contando citas confirmadas y holds del día local.
9. **Salida.** Lista ordenada de `{inicio_utc, fin_utc, asientos_libres}`; `api` la formatea en la zona del
   visitante. A un cliente final nunca se le devuelve quién ocupa un horario.

Rendimiento: 2–4 consultas por petición y aritmética de intervalos en memoria; objetivo p95 < 50 ms
dentro del motor para 31 días.

## 4.5 Recurrencia

Solo propietario y editores crean series; el motor lo vuelve a comprobar con el actor (`customer` →
`PermissionDenied`).

- **Subconjunto RRULE admitido** (lo que ofrece la interfaz): `FREQ` = DAILY | WEEKLY | MONTHLY | YEARLY;
  `INTERVAL` 1–99; `BYDAY` (con ordinal ±1…±5 solo en MONTHLY/YEARLY); `BYMONTHDAY` (1…31 y −1);
  `BYMONTH`; `COUNT` ≤ 730; `UNTIL`; `WKST=MO`. Cualquier otra parte se rechaza con un error claro.
- **Expansión en hora de pared** con `tzid`: «cada martes 10:00» sigue a las 10:00 tras el cambio de
  horario. Hora inexistente: primera válida posterior (RFC 5545 §3.3.5). Día 31 en meses cortos: se omite.
- **Materialización.** Las instancias se guardan como filas de `events` hasta `min(UNTIL, now + 18 meses)`;
  un job diario extiende el horizonte. Así la restricción `EXCLUDE` protege también las series.
- **Conflictos al crear.** Se comprueban todas las instancias del horizonte; la respuesta lista los
  conflictos y la petición elige `on_conflict = abort | skip` (`skip` añade `EXDATE`).
- **Edición por alcance:**
  - *Solo este*: la instancia queda como excepción (`is_exception`); cancelar añade su fecha a `EXDATE`.
  - *Este y los siguientes*: la serie original termina antes de la instancia; nace una serie nueva desde
    ella; las instancias futuras se regeneran. Las excepciones posteriores se descartan, con aviso previo
    en la interfaz (mismo comportamiento que Google Calendar).
  - *Todos*: se actualiza la serie y se regeneran las instancias futuras no excepcionales; el pasado no
    se toca.
- **Avisos.** Un cambio a una serie produce un único aviso resumen, no uno por instancia; las instancias
  con cliente final generan además el aviso a ese cliente.
- **Pruebas diferenciales.** La expansión propia se compara con `rrule-go` en miles de reglas aleatorias
  dentro del subconjunto, y con los ejemplos del RFC 5545.

## 4.6 Feriados y festivos

`rickar/cal` solo cubre 45 países y deja fuera a la mayoría de Latinoamérica, así que el motor usa datos
generados:

1. `tools/holidays-gen` (Node, `date-holidays` 3.37.0) genera un archivo por país,
   `internal/holidays/data/<CC>.json.gz`, con los años `actual − 1` a `actual + 5`: fecha, nombre en es y
   en, tipo (`public`, `bank`, `school`, `optional`, `observance`), región ISO 3166-2 y si es día
   trasladado.
2. Go los embebe con `//go:embed` y carga cada país al pedirlo (caché LRU de 30 países), para no ocupar
   memoria con 200 países.
3. Un workflow anual (`holidays-refresh.yml`, cada 1 de octubre) regenera los datos y abre un PR.
4. Política por tablero: uno o varios países, región opcional y tipos que bloquean (por defecto
   `public`). Se suman los feriados propios (fecha concreta o cada año) y se restan las excepciones
   («abrimos el 16 de septiembre»).
5. Licencia: el código de `date-holidays` es ISC y los datos CC-BY-3.0. La página `/creditos` (`/credits`)
   incluye la atribución.

`ListHolidays(tablero, rango)` devuelve los feriados aplicables con nombre en el idioma del actor, para el
asistente de alta, el panel y MCP.

## 4.7 Reservas, holds y concurrencia

Toda escritura que cambia la ocupación de un tablero sigue el mismo patrón:

```text
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('cal:' || :calendar_id, 0));
-- 1. limpia holds caducados del rango
-- 2. valida reglas (horario, feriados, bloqueos, ocupado externo, capacidad, límite diario)
-- 3. elige el asiento libre más bajo e inserta o actualiza
-- 4. inserta el job outbox (evento de dominio) y los jobs de sincronización
COMMIT;
```

- **Hold:** `status = held`, `hold_expires_at = now + 10 min`, ligado al actor. Si la restricción `EXCLUDE`
  salta (carrera con otro proceso), se prueba el siguiente asiento; si no queda ninguno, `409 slot_taken`.
- **Confirmación:** comprueba que el hold existe, no ha caducado y es del actor; consulta en vivo el
  ocupado externo (tiempo máximo 3 s; si el proveedor no responde, usa la caché y lo registra) y pasa a
  `confirmed`.
- **Holds caducados:** job periódico cada minuto y limpieza dentro del propio bloqueo.
- **Idempotencia:** `Idempotency-Key` del cliente (o generada por formulario en `api`) única por tablero;
  un reintento devuelve el mismo resultado.
- **Concurrencia optimista:** toda modificación lleva `expected_version`; si no coincide, `409 conflict` con
  el estado actual.
- **Personal del negocio:** no puede superar la capacidad; si necesita más, aumenta la capacidad del
  tablero. Un bloqueo sí puede crearse sobre citas existentes: la respuesta lista las afectadas y la
  petición decide si se cancelan (con aviso) o se mantienen.
- **Reprogramar** es una operación atómica (nuevo asiento y horario en la misma transacción; si falla, la
  cita original queda intacta).
- **Políticas de cancelación** del tablero (antelación mínima para que el cliente final cancele o
  reprograme por su cuenta) se aplican al actor `customer`; el personal puede siempre.

## 4.8 Eventos de dominio

Cada cambio inserta en la misma transacción un job `deliver_domain_event`. El worker llama a
`EventIngress.Publish` en `api` y reintenta con espera exponencial durante 24 h.

```json
{
  "event_id": "0192f3c4-…",
  "type": "booking.rescheduled",
  "occurred_at": "2026-11-03T16:30:00Z",
  "org_id": "…", "calendar_id": "…",
  "actor": { "user_id": "…", "role": "customer", "via": "embed" },
  "subject": {
    "event_id": "…", "series_id": null, "kind": "appointment", "status": "confirmed",
    "start": "2026-11-05T17:00:00Z", "end": "2026-11-05T17:30:00Z",
    "previous": { "start": "2026-11-04T16:00:00Z", "end": "2026-11-04T16:30:00Z" },
    "customer_user_id": "…", "service_id": "…"
  },
  "version": 4
}
```

Tipos: `calendar.created|updated|archived`, `event.created|updated|cancelled|deleted` (personal y
bloqueos), `series.created|updated|cancelled` (resumen), `booking.created|rescheduled|cancelled`
(reservaciones de clientes finales), `attendance.marked`, `sync.connection_failed|restored`. Los holds
no generan avisos.

## 4.9 Sincronización con Google Calendar, Outlook y Apple Calendar

El estudio técnico explica por qué la sincronización bidireccional completa es lo más difícil. Este plan
cumple «sincronizar con los tres» en dos niveles, con **nuestro sistema como fuente de verdad**:

### Nivel 1 — Suscripción y archivos (los tres proveedores, sin OAuth)

- **Feed del tablero** para propietario, editores y observadores: `GET /ics/{token}.ics`, del día −30 al
  +365, con `REFRESH-INTERVAL;VALUE=DURATION:PT15M`, `X-PUBLISHED-TTL:PT15M` y `ETag`. Alcance `full`
  (con detalles) o `busy` (solo «Ocupado»). Token de 32 bytes, guardado como hash, revocable.
- **Feed personal del cliente final**: solo sus citas en ese negocio.
- Enlaces `webcal://` con instrucciones por proveedor. Aviso en la interfaz: Google refresca las
  suscripciones con retraso (horas); para inmediatez está el nivel 2.
- **Correos con `.ics`** (`METHOD:REQUEST` al crear o cambiar, con `SEQUENCE` creciente; `METHOD:CANCEL` al
  cancelar; `UID` estable), más botones «Añadir a Google Calendar», «Añadir a Outlook» y descarga `.ics`
  para Apple. Lo genera el motor con `RenderICS` y lo adjunta `api`.

### Nivel 2 — Conexión directa del tablero (OAuth o CalDAV)

| | Google Calendar | Outlook / Microsoft 365 | Apple iCloud |
|---|---|---|---|
| Alta | OAuth en `api`; tokens a `calendar` | OAuth en `api` (endpoint `common`: cuentas personales y de empresa) | Apple ID + contraseña específica de app, validada contra `caldav.icloud.com` |
| Permisos | `calendar.calendarlist.readonly`, `calendar.freebusy`, `calendar.app.created` (los permisos de Calendar exigen verificar la app con Google antes de abrirla al público; confirmar la clasificación de cada uno en la consola) | `offline_access`, `User.Read`, `Calendars.ReadWrite` (algunas empresas exigen consentimiento del administrador) | Acceso CalDAV de la cuenta |
| Leer ocupado | `freebusy.query` de los calendarios elegidos | `getSchedule` y `calendarView` de los calendarios elegidos | REPORT `free-busy-query`; si no está, `calendar-query` con `expand`; si tampoco, VEVENT expandidos con `rrule-go` |
| Escribir nuestros eventos | En el calendario secundario «Mi Cita en Tiempo — <tablero>» que crea la app (`iCalUID` = el nuestro) | En un calendario «Mi Cita en Tiempo» creado en el buzón | En el calendario elegido, `PUT <uid>.ics` |
| Detectar cambios en lo escrito | Canal `events.watch` del calendario de la app + `syncToken` | Suscripción de Graph sobre ese calendario + `delta`; renovar antes de caducar | Sondeo cada 10 min con `getctag` / `sync-collection` |

Reglas comunes:

- **Ocupado externo** se guarda en `external_busy` con 5 min de vigencia, se refresca bajo demanda al
  pedir disponibilidad y se consulta en vivo antes de confirmar (como decidió el estudio técnico).
- **Fuente de verdad.** Si alguien mueve o borra en el proveedor un evento escrito por nosotros, el motor
  lo restaura en la siguiente sincronización y avisa al propietario («los cambios se hacen en Mi Cita en
  Tiempo»). Aceptar cambios externos como reprogramaciones queda para post-lanzamiento.
- **Reconciliación cada 15 min** por conexión (idea de DayOtter): refresca ocupado de 14 días, repara
  eventos escritos que falten o difieran y renueva canales y suscripciones próximos a caducar.
- **Credenciales cifradas** con AES-256-GCM (clave derivada con HKDF de `CALENDAR_TOKEN_ENC_KEY`, con id de
  clave para rotarla).
- **Errores**: credencial revocada → estado `revoked`, se detienen sus jobs y se avisa al propietario con
  botón «Reconectar»; límite de cuota → espera exponencial; error transitorio → reintento.
- **Salud visible** en el panel: estado, última sincronización correcta y último error.
- **URLs base configurables** de cada proveedor, para apuntarlas a dobles en pruebas.

## 4.10 API interna (Connect RPC, paquete `mcet.calendar.v1`)

| Servicio | RPC |
|---|---|
| `CalendarService` | `CreateCalendar`, `GetCalendar`, `GetCalendarBySlug`, `ListCalendars`, `UpdateCalendar`, `ArchiveCalendar`, `SetOrgStatus`, `DeleteOrgData`, `AnonymizeCustomer` |
| `ScheduleService` | `GetSchedule`, `SetWeeklyHours`, `UpsertDateOverride`, `DeleteDateOverride`, `SetHolidayPolicies`, `UpsertCustomHoliday`, `DeleteCustomHoliday`, `ListHolidays`, `ListCountries`, `ListSubdivisions` |
| `ServiceCatalogService` | `ListServices`, `CreateService`, `UpdateService`, `DeleteService`, `ReorderServices` |
| `AvailabilityService` | `GetSlots`, `CheckSlot` |
| `EventService` | `ListEvents`, `GetEvent`, `CreateEvent` (único o serie), `UpdateEvent` (alcance + `expected_version`), `CancelEvent`, `DeleteEvent` (bloqueos), `HoldSlot`, `ConfirmHold`, `ReleaseHold`, `RescheduleBooking`, `MarkAttendance`, `ListCustomerBookings` |
| `StatsService` | `GetStats` (por periodo, estado, servicio, día de la semana y hora; ocupación; cancelaciones; inasistencias) |
| `SyncService` | `UpsertConnection`, `ListConnections`, `UpdateExternalCalendar`, `DeleteConnection`, `ResyncConnection`, `GetSyncStatus`, `CreateFeed`, `RevokeFeed`, `ListFeeds`, `RenderICS` |

Errores con códigos de Connect y detalle tipado (`slot_taken`, `conflict`, `outside_hours`, `holiday`,
`plan_limit`, `permission_denied`, `invalid_rrule`), que `api` traduce a `application/problem+json`.

## 4.11 Endpoints HTTP

| Puerto | Ruta | Uso |
|---|---|---|
| 8080 (vía gateway) | `POST /hooks/google` | Avisos de canal: valida `X-Goog-Channel-Token` (HMAC) y encola sincronización incremental |
| 8080 (vía gateway) | `POST /hooks/microsoft` | Responde el `validationToken`, valida `clientState` y encola |
| 8080 (vía gateway) | `GET /ics/{token}.ics` | Feeds; límite de peticiones en gateway |
| 8080 | `GET /healthz` | Vida (lo usa el `healthcheck` del compose) |
| 8081 (interno) | Connect RPC, `GET /readyz`, `GET /metrics` | Base de datos y migraciones listas; métricas Prometheus |

## 4.12 Trabajos de River

| Job | Disparo |
|---|---|
| `deliver_domain_event` | En la transacción de cada cambio |
| `expire_holds` | Cada minuto |
| `extend_series` | Diario, 03:00 UTC |
| `refresh_busy` | Bajo demanda (caché vencida) y en la reconciliación |
| `push_event` | Al crear, cambiar o cancelar un evento con conexión de escritura |
| `sync_incremental` | Al llegar un aviso de Google o Microsoft |
| `reconcile_connection` | Cada 15 min por conexión activa |
| `poll_caldav` | Cada 10 min por conexión de iCloud |
| `purge_org` | Al vencer el periodo de retención de una organización borrada |

Concurrencia limitada (5 workers de sincronización, 10 del resto) para respetar el límite de memoria.

## 4.13 Configuración y memoria

Variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `RPC_SECRET_API_TO_CALENDAR`,
`RPC_SECRET_CALENDAR_TO_API`, `API_RPC_URL`, `CALENDAR_TOKEN_ENC_KEY`, `PUBLIC_URL_ES`, `PUBLIC_URL_EN`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CHANNEL_SECRET`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
`MS_CLIENT_STATE_SECRET`, `LOG_LEVEL`, `GOMEMLIMIT`, `TEST_MODE` (prohibida en producción: si está activa
y el host de `PUBLIC_URL_ES` es un dominio real, el proceso no arranca).

Memoria: `mem_limit: 160m` con `GOMEMLIMIT=120MiB`; pool de pgx de 10 conexiones; datos de feriados
cargados por país bajo demanda.
