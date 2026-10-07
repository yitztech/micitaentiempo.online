# 0017. Sincronización con REST directo y dobles propios

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

El plan proponía `google.golang.org/api` para Google y REST propio para Microsoft Graph. El motor tiene un
límite de 160 MiB y la biblioteca de Google añade varios MB al binario y mucha memoria de arranque. Además,
hacían falta dobles de Google, Graph e iCloud para las pruebas.

## Decisión

- **Google y Microsoft con REST directo** sobre `net/http` + `golang.org/x/oauth2` (renovación de tokens con
  guardado cifrado). iCloud con `go-webdav` (CalDAV, `calendar-query` con `expand`).
- **URLs base configurables** (`GOOGLE_API_URL`, `GOOGLE_TOKEN_URL`, `MS_GRAPH_URL`, `MS_TOKEN_URL`,
  `ICLOUD_CALDAV_URL`) y, en `api`, `GOOGLE_AUTHORIZE_URL` y `MS_AUTHORIZE_URL`.
- **Dobles:** un servidor `httptest` en las pruebas de Go y el servidor de captura (`tests/fakes`) en los
  escenarios, con estado por cuenta (OAuth, calendario de la app, ocupado, revocación). iCloud se prueba
  contra **Radicale** real (CalDAV).
- **Ocupado externo** en `external_busy` (5 min de vigencia), consultado en vivo antes de apartar y de
  confirmar; los eventos escritos por nosotros no cuentan como ocupado.
- **Fuente de verdad:** la reconciliación (cada 10 min y al llegar un aviso) restaura lo que se mueva o borre
  fuera y avisa al propietario.

## Consecuencias

Binario pequeño y pruebas sin red. A cambio, el código de cada API es nuestro: los cambios de Google o Graph
se detectan con las pruebas contra sus entornos reales antes del lanzamiento (`docs/google-verificacion.md`).
