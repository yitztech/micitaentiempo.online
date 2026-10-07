# 9. Pruebas

Ninguna imagen se publica si falla una prueba (lo exige el contrato). Las pruebas por escenarios son la
especificación ejecutable del producto: cada requisito de `01-requisitos.md` tiene al menos un escenario
que lo demuestra, en los dos idiomas y en los dispositivos que importan.

## 9.1 Capas

| Capa | Herramienta | Qué cubre | Objetivo |
|---|---|---|---|
| Unitarias del motor | `go test`, `rapid` (propiedades) | Disponibilidad, recurrencia, feriados, cifrado | ≥ 90 % de líneas en `availability`, `recurrence`, `holidays` |
| Escenarios del motor | Corredor de YAML propio (§9.3) | Casos de negocio de disponibilidad legibles por personas | Todos los RF de horarios |
| Integración del motor | Testcontainers (PostgreSQL 18 real) | Restricción `EXCLUDE`, concurrencia, migraciones, River, sincronización contra dobles | Rutas críticas |
| Unitarias e integración de `api` | Vitest 5, Testcontainers, `fastify.inject` | Servicios, guardas, Stripe, avisos, OAuth, MCP | ≥ 80 % |
| Componentes de `web` | Vitest + Testing Library + MSW | Formularios, rejilla de horarios, editor de recurrencia, i18n | Componentes con lógica |
| **Escenarios de punta a punta** | **playwright-bdd 9 sobre Playwright 1.63** | Recorridos completos con varios actores, idiomas y dispositivos | Todos los RF |
| Permisos | Generadas desde la matriz (§9.4) | Cada rol × cada endpoint y herramienta MCP | 100 % de la matriz |
| Accesibilidad | `@axe-core/playwright` | Páginas clave sin violaciones serias | 0 serias o críticas |
| Visuales y responsive | Capturas de Playwright | Calendario, reserva y embed en 360, 768, 1024 y 1440 px | Sin diferencias no aprobadas |
| Rendimiento | k6 | Disponibilidad y reserva | p95 de RNF-08 |
| Seguridad | CodeQL, Trivy, revisión de dependencias, ZAP *baseline* (nocturno) | Código, imágenes, dependencias, cabeceras | Sin críticos abiertos |

## 9.2 Pruebas automatizadas por escenarios

### Formato

Escenarios en **Gherkin en español** (`# language: es`: `Característica`, `Antecedentes`, `Escenario`,
`Esquema del escenario`, `Ejemplos`, `Dado`, `Cuando`, `Entonces`, `Y`, `Pero`). Los escribe o revisa
negocio; los pasos los implementa el equipo una sola vez y se reutilizan.

```
tests/escenarios/
  features/
    cuentas/registro.feature
    tableros/alta-y-feriados.feature
    roles/editores-y-observadores.feature
    reservas/embed-movil.feature
    reservas/concurrencia.feature
    eventos/recurrencia.feature
    avisos/canales.feature
    sincronizacion/google-outlook-icloud.feature
    facturacion/prueba-y-planes.feature
    mcp/mcp.feature
    idiomas/dominios-y-seo.feature
  steps/            # definiciones de pasos (TypeScript), agrupadas por dominio
  fixtures/         # actores, reloj, correo (Mailpit), dobles, semillas
  playwright.config.ts
```

### Ejemplo

```gherkin
# language: es
@reservas @critico
Característica: Reserva desde el widget embebido
  Como clienta de un negocio
  quiero reservar desde la web del negocio
  para no tener que llamar

  Antecedentes:
    Dado un negocio "Clínica Sol" con plan "Personal" y zona horaria "America/Mexico_City"
    Y su tablero "Consultas" abre de lunes a viernes de 09:00 a 18:00 con comida de 14:00 a 15:00
    Y el servicio "Consulta general" dura 30 minutos
    Y la fecha actual es "2026-11-02 08:00" en "America/Mexico_City"

  @movil
  Escenario: Reservar un horario libre con verificación por código
    Dado que la clienta "Ana" abre el widget de "Consultas" en el dominio "es" desde un "iPhone 15"
    Cuando elige "Consulta general" el "martes 3 de noviembre" a las "10:30"
    Y verifica su correo "ana@example.com" con el código recibido
    Entonces ve la confirmación con el botón "Añadir al calendario"
    Y el propietario ve el aviso "Nueva reservación" en su panel sin recargar
    Y "ana@example.com" recibe un correo en español con un archivo ".ics"

  Escenario: Una clienta no ve las reservaciones de otra
    Dado que "Beto" tiene una reservación el "martes 3 de noviembre" a las "11:00"
    Cuando la clienta "Ana" consulta los horarios del "martes 3 de noviembre"
    Entonces el horario "11:00" no aparece
    Y ninguna respuesta de la API contiene "Beto"

  Esquema del escenario: El idioma lo decide el dominio
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces el documento tiene lang="<idioma>"
    Y enlaza con hreflang a "<par>" en el otro dominio
    Y no hay redirección automática

    Ejemplos:
      | dominio | ruta     | idioma | par      |
      | es      | /precios | es     | /pricing |
      | en      | /pricing | en     | /precios |
```

### Cómo funciona por dentro

| Pieza | Decisión |
|---|---|
| Ejecutor | `playwright-bdd` genera pruebas de Playwright desde los `.feature`: paralelismo, reintentos, trazas, vídeo y proyectos por dispositivo de serie |
| Varios actores | Cada actor (propietario, editor, observador, clienta) tiene su propio contexto de navegador y su sesión; un escenario los combina |
| Dispositivos | Proyectos `escritorio` (1440 px), `tableta` (iPad Pro 11, vertical y horizontal), `movil` (iPhone 15 y Pixel 8); etiquetas `@movil`, `@tableta`, `@escritorio` |
| Reloj | El reloj del motor es uno para todo el entorno. Los escenarios que lo mueven llevan `@reloj` y corren en el proyecto `reloj`, con un solo worker y en una segunda pasada (`tests/escenarios/correr.sh`); el resto fija siempre la misma fecha base. No se usa `dependencies` de Playwright porque las dependencias ignoran `--grep` |
| Idiomas | Cada escenario de interfaz se ejecuta en `es` y `en` (los textos esperados salen de los catálogos, no se copian) |
| Dominios locales | `micitaentiempo.localhost` y `myappointmentontime.localhost` (en CI, entradas en `/etc/hosts`) |
| Reloj | `api` y `calendar` usan un reloj controlable solo con `TEST_MODE=1` (endpoint interno `POST /__test/clock`); el navegador, con `page.clock`. Permite probar recordatorios, holds que caducan y el fin de la prueba gratuita sin esperar |
| Datos | Semillas por escenario mediante `POST /__test/seed` (solo con `TEST_MODE`), cada escenario en una organización nueva: los escenarios no se pisan y pueden ir en paralelo |
| Correo | Mailpit; los pasos leen su API (asunto, idioma, adjuntos `.ics`, enlaces) |
| Google login | Servidor OIDC simulado (p. ej. `mock-oauth2-server`) configurado como proveedor en `TEST_MODE` |
| Google Calendar y Microsoft Graph | Dobles HTTP propios (`tests/fakes/`), con estado, que imitan los endpoints usados; las URL base del motor apuntan a ellos |
| iCloud | Servidor CalDAV real en contenedor (Radicale) |
| Stripe | Dos configuraciones: **sin claves** (como producción por ahora) y **con `stripe-mock`** (claves ficticias, URL base del API apuntando al mock solo con `TEST_MODE`, webhooks firmados por el propio arnés). Nunca claves reales |
| WhatsApp, Slack, Telegram | Servidor de captura que registra las peticiones salientes y simula respuestas y errores |
| MCP | Pasos que actúan como un cliente MCP real (`@modelcontextprotocol/client` 2.3.1), incluido el flujo OAuth con CIMD y DCR |
| Informes | HTML de Playwright e informe Cucumber; trazas, vídeos y capturas de los fallos como artefactos de CI |

Los endpoints `/__test/*` no existen si falta `TEST_MODE=1`, y los servicios se niegan a arrancar con
`TEST_MODE` si sus URLs públicas son dominios reales.

### Entornos y frecuencia

| Dónde | Qué escenarios | Topología |
|---|---|---|
| Local (`pnpm escenarios`, o `pnpm escenarios --grep @reservas`) | Los que se elijan | `compose.prod.yml` + `compose.ci.yml` con imágenes construidas en local |
| CI en cada PR | `@humo` y `@critico` (≈ 10 min) | Igual, con las imágenes del PR |
| Nocturno | Todos, matriz es/en × dispositivos | Igual |
| Tras desplegar (opcional) | `@humo-produccion`: solo lectura, contra producción, con un negocio sintético | Producción real |

`compose.ci.yml` es una capa sobre `compose.prod.yml`: añade `build:`, `TEST_MODE=1`, los dobles y puertos
locales. Así las pruebas corren contra la misma topología que producción.

### Catálogo inicial

| Área | Escenario | Etiquetas | RF |
|---|---|---|---|
| Cuentas | Registro con correo exige verificar antes de usar el panel | `@critico` | RF-01, RF-02 |
| Cuentas | Se rechazan dominios sin MX y correos desechables | | RF-02 |
| Cuentas | Registro e inicio de sesión con Google | `@critico` | RF-01 |
| Cuentas | La sesión de un dominio no vale en el otro | | RF-16 |
| Prueba | Con facturación activada (`stripe-mock`): la prueba de 30 días se activa al registrarse; avisos a 7 y 3 días; al vencer, solo lectura | `@critico` | RF-03 |
| Tableros | El asistente crea el tablero con horario, comida, desayuno y feriados de México | `@critico` | RF-05, RF-06 |
| Tableros | Personal no deja crear un segundo tablero; Sucursales permite 10 y no 11 | | RF-04 |
| Feriados | Feriados de EE. UU. y Canadá (con región) bloquean; «abrimos ese día» los desbloquea | | RF-06 |
| Roles | Editor acepta con Google y el mismo correo; con otro correo, rechazo | `@critico` | RF-08 |
| Roles | Observador ve todo y no puede editar | | RF-09 |
| Roles | Un cliente final no ve reservaciones ajenas (interfaz, API y MCP) | `@critico` | RF-10 |
| Roles | Un cliente final no puede crear eventos recurrentes | | RF-12 |
| Eventos | Editor crea una serie semanal y cambia «este y los siguientes» | `@critico` | RF-12 |
| Eventos | Un evento bloqueante impide reservar en su rango | | RF-11 |
| Reservas | Reserva desde el embed en móvil con código de verificación | `@critico @movil` | RF-07, RF-17 |
| Reservas | Dos clientas piden el mismo horario a la vez: con capacidad 1 gana una; con capacidad 3, tres | `@critico` | RNF-10 |
| Reservas | El hold caduca a los 10 minutos y libera el horario | | RF-07 |
| Reservas | Reprogramar y cancelar la propia reservación desde «Mis citas» | | RF-10 |
| Horario | Cambio de horario de verano en `America/New_York` (marzo y noviembre): franjas correctas | `@critico` | RNF-10 |
| Avisos | Al modificar un evento, propietario y observadores reciben aviso en el panel y por correo, cada uno en su idioma | `@critico` | RF-13 |
| Avisos | Vincular Telegram con el enlace del bot y recibir el aviso | | RF-14 |
| Avisos | Recordatorios a 24 h y 1 h; no se envían si la cita se canceló | | RF-22 |
| Avisos | Sin WhatsApp configurado, el canal no aparece; con el servidor de captura, se envía la plantilla en el idioma del usuario | | RF-14 |
| Sincronización | El feed ICS del tablero tiene los eventos; el del cliente final, solo sus citas | | RF-15 |
| Sincronización | Ocupado en Google bloquea horarios; la reserva aparece en el calendario de la app | | RF-15 |
| Sincronización | Mover en Google un evento nuestro se restaura y avisa al propietario | | RF-15 |
| Sincronización | Credencial revocada: estado «Reconectar» y aviso | | RF-15 |
| Facturación | Sin Stripe configurado (como en producción por ahora): planes visibles, «Contratar» muestra «Disponible pronto», la prueba no vence y se respetan los límites del plan | `@critico @humo` | RF-03, RF-04 |
| Facturación | Con `stripe-mock`: contratar Personal; el webhook activa la suscripción | | RF-04 |
| Facturación | Con `stripe-mock`: pago fallido → aviso → solo lectura tras 7 días | | RF-04 |
| MCP | Conectar un cliente MCP con CIMD y consentimiento; la IA lista tableros y huecos | `@critico` | RF-18 |
| MCP | La IA crea un evento con `calendar:write`; con solo lectura, se le niega | | RF-18 |
| MCP | Un token de otra organización no ve nada | `@critico` | RF-18 |
| Idiomas y SEO | `lang`, `hreflang`, `canonical`, `x-default`, `sitemap.xml` y `robots.txt` correctos en los dos dominios | `@humo` | RF-16 |
| Responsive | Calendario y reserva en iPhone, Android e iPad sin desbordes (capturas) | `@movil @tableta` | RF-17 |
| Accesibilidad | Páginas clave sin violaciones serias de axe | `@humo` | RNF-07 |

Cada fase añade los escenarios de lo que entrega (`10-fases.md`); un PR que añade un requisito sin su
escenario no se aprueba.

## 9.3 Escenarios del motor (Go)

Para la lógica de horarios, escenarios en YAML que una persona de negocio puede leer y ampliar, ejecutados
por un corredor genérico en `internal/availability`:

```yaml
nombre: Comida y feriado nacional en México
tablero:
  zona: America/Mexico_City
  capacidad: 1
  horario:
    lunes-viernes: ["09:00-14:00", "15:00-18:00"]
  feriados: [{ pais: MX, tipos: [public] }]
servicio: { duracion: 30, margen_despues: 10, intervalo: 30, antelacion_minima: 60 }
ahora: "2026-09-15T08:00:00-06:00"
existentes:
  - { tipo: cita, inicio: "2026-09-15T09:00:00-06:00", fin: "2026-09-15T09:30:00-06:00" }
consulta: { desde: "2026-09-15", hasta: "2026-09-16", zona_visitante: America/Mexico_City }
esperado:
  "2026-09-15":
    incluye: ["10:00", "13:30", "15:00", "17:30"]
    excluye: ["09:00", "09:30", "14:00", "14:30"]
  "2026-09-16": { vacio: true, motivo: feriado }   # Día de la Independencia
```

Biblioteca inicial (≥ 40 archivos): cambios de horario en `America/New_York`, `America/Toronto`,
`America/Tijuana`, `Europe/Madrid` y `Australia/Lord_Howe` (salto de 30 min); zonas con desfase no entero
(`Asia/Kolkata`, `America/St_Johns`); feriados con región (EE. UU. por estado, Canadá por provincia) y días
trasladados; excepciones por fecha; capacidad > 1; márgenes; límite diario; turnos que cruzan medianoche;
series con `EXDATE` y excepciones.

## 9.4 Permisos

Una tabla en código (`tests/permisos/matriz.ts`) describe la matriz de `01-requisitos.md` §1.6; de ella se
generan pruebas para cada endpoint REST y cada herramienta MCP, con cada rol y con un usuario de **otra
organización** (protección contra IDOR). Cualquier endpoint nuevo sin entrada en la matriz hace fallar CI.

## 9.5 Concurrencia

Prueba de integración del motor: 50 rutinas piden el mismo horario a la vez; deben confirmarse exactamente
`capacidad` reservas y el resto recibir `slot_taken`. Se repite con reprogramaciones cruzadas y con un
bloqueo creado a la vez.

## 9.6 Rendimiento

Script k6 contra el entorno de CI con los límites de memoria de producción: 50 peticiones/s de
disponibilidad (31 días) y 5 reservas/s durante 5 minutos; umbrales p95 de RNF-08; el nocturno guarda la
tendencia.

## 9.7 Puertas de calidad

Un PR solo se puede fusionar con todo en verde: Biome, tipos, claves i18n completas, unitarias,
integración, escenarios `@humo` y `@critico`, permisos, Trivy, CodeQL y revisión de dependencias. El
despliegue repite las pruebas antes de publicar imágenes.
