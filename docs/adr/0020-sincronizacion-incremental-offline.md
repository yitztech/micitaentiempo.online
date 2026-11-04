# ADR 0020 — Sincronización incremental offline (`GET /api/offline/changes`)

Estado: aceptada (C01). Complementa el punto 7 de [ADR 0019](0019-perfiles-directorio-offline.md).

## Contexto

`GET /api/offline/changes` devolvía siempre `items: []`, `nextCursor: null` y la hora del servidor, sin mirar
usuario ni cursor. Un cliente móvil podía interpretar esa respuesta como «estoy al día» mientras conservaba datos
obsoletos o retirados. No se publica una respuesta vacía como descarga válida: o hay cambios reales, o el recurso
figura como no soportado.

## Decisión

### 1. Recursos y capacidades

| Recurso | Id | Contenido (`data`) | Quién lo ve |
|---|---|---|---|
| `business_profile` | id del negocio | `PrivateBusinessProfile` (mismo DTO de `GET /api/business-profile`) | propietario de la organización, no borrada ni suspendida |
| `business_location` | id de la sede | `PrivateLocation` (mismo DTO de `GET /api/business-profile/locations`) | ídem |

Cada respuesta declara `resources` (los sincronizados) y `unsupported` (`calendar_locations`, `images`, `bookings`,
`agenda`, `public_profiles`). Las citas y la agenda viven en el motor de calendario y siguen descargándose completas
con `GET /api/public/v1/my/bookings`; no se simulan como «sin cambios». Los perfiles públicos guardados caducan por
TTL. Un recurso no soportado no se representa nunca como una sincronización vacía exitosa.

### 2. Registro de cambios en la misma transacción

Tabla `app.sync_changes(seq identity, txid xid8 default pg_current_xact_id(), org_id, resource, resource_id,
op, revision, created_at)`, alimentada por **triggers** `AFTER INSERT/UPDATE/DELETE FOR EACH ROW` sobre
`business_profiles` y `business_locations`. Por ser triggers:

- cubren todas las rutas de escritura (servicio, imágenes, migraciones, borrado en cascada de la organización);
- si la transacción hace *rollback*, el cambio tampoco se publica;
- no guardan datos privados: solo identificadores. El contenido se materializa al leer, con los permisos vigentes.

`revision` es el `seq` del cambio: monótono y global. Un `DELETE` queda como tombstone (`op = 'delete'`).

### 3. Orden entre transacciones que confirman en distinto orden

`seq` se asigna al insertar, no al confirmar: una transacción con `seq = 10` puede confirmar después de otra con
`seq = 11`, y un lector que avanzara hasta 11 perdería el 10. Se evita así: cada fila lleva el `xid8` de su
transacción y el lector solo devuelve filas con `txid < pg_snapshot_xmin(pg_current_snapshot())`, es decir, de
transacciones ya terminadas (confirmadas o abortadas). El orden de lectura es `(txid, seq)`. Una transacción larga
retrasa el feed, pero nunca lo hace saltarse un cambio.

### 4. Cursor opaco

`base64url(JSON) . HMAC-SHA256`, con clave derivada de `BETTER_AUTH_SECRET` y separación de dominio. Contiene:
versión de esquema, tipo (`c` cambios | `s` snapshot), id del actor, hash del ámbito autorizado, `iat`/`exp`
(30 días) y la posición (`txid`, `seq`) o, en snapshot, la marca de agua y la última clave. Se limita a
`OFFLINE_LIMITS.cursor` caracteres.

| Situación | Respuesta |
|---|---|
| Firma incorrecta, mal formado, versión desconocida, **de otra cuenta** | `400 invalid_cursor` (misma respuesta: no revela si existe) |
| Caducado (`exp`) o el ámbito autorizado cambió (alta/baja de organización, borrado, suspensión) | `410 sync_cursor_expired` con `reason` → el cliente pide snapshot |
| Válido | página de cambios |

El cliente no aporta autorización: el actor sale de la sesión y el ámbito (organizaciones que puede ver) se recalcula
**en cada página**.

### 5. Páginas y snapshot

- Sin `cursor`: **snapshot** paginado. Primera página con `reset: true` (el cliente descarta su caché de los recursos
  declarados antes de aplicarla), items `upsert` ordenados por clave (`business_profile` antes que
  `business_location`, luego id). Se captura una **marca de agua** (`pg_snapshot_xmin` al empezar) que viaja en el
  cursor; al terminar (`snapshotComplete: true`) el `nextCursor` es de cambios y arranca en esa marca, de modo que
  lo confirmado durante el snapshot se reproduce después. Aplicar un upsert dos veces es idempotente por `revision`.
- Con cursor de cambios: hasta `limit` (≤ 100) filas, colapsadas por recurso (se conserva la última) y
  materializadas: si el recurso existe y el actor lo ve → `upsert` con `data`; si ya no existe → `delete`.
- `nextCursor` es siempre una cadena. `hasMore = false` deja el cursor en el horizonte seguro, de modo que
  repetirlo no produce duplicados ni lagunas; repetir un cursor es seguro.
- Perder el permiso: el cambio de ámbito fuerza `410` y un snapshot con `reset: true` que ya no contiene el negocio.

Ejemplos (negocio `B1`, sedes `L1`, `L2`):

| Llamada | Respuesta |
|---|---|
| inicial, `limit=2` | `mode: snapshot, reset: true`, items `[profile B1, location L1]`, `hasMore: true`, cursor `s…` |
| intermedia | items `[location L2]`, `snapshotComplete: true`, `hasMore: false`, cursor `c…@marca` |
| tras editar `L1` y borrar `L2` | `upsert L1 (revision 41)`, `delete L2 (revision 42)`, `hasMore: false` |
| propietario pierde la organización | `410 sync_cursor_expired` (`scope_changed`); el snapshot siguiente trae `reset: true` e `items: []` |
| cursor de otra cuenta | `400 invalid_cursor` |
| cursor de hace 31 días | `410 sync_cursor_expired` (`cursor_expired`) |
| tx A (`seq` 10) confirma después de tx B (`seq` 11) | B no se entrega hasta que A termina; después llegan A y B |

### 6. Retención

`sync_changes` se conserva 31 días (más que el cursor de 30). Una tarea periódica borra lo anterior. Un cursor
nunca es válido más allá de lo retenido, así que no hay lagunas silenciosas.

### 7. Aplicación en el móvil (C03)

Cada página (datos, tombstones y cursor) se aplica en **una sola transacción** del almacenamiento: o se guarda todo
o nada. `reset: true` limpia la caché de los recursos declarados y respeta borradores y operaciones pendientes: una
edición local no resuelta no se sobrescribe y un pendiente antiguo no resucita un recurso dado de baja.

## Consecuencias

- Un trigger por tabla; coste de una inserción por cambio de fila.
- El feed no incluye citas ni agenda (siguen en descarga completa) ni imágenes; se declaran en `unsupported`.
- Sin infraestructura de mensajería: PostgreSQL basta.
