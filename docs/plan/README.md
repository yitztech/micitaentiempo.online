# Plan de construcción — Mi Cita en Tiempo

Versión del 2026-10-06. Plan para construir Mi Cita en Tiempo, el servicio de reservas por suscripción de
micitaentiempo.online (es) y myappointmentontime.online (en). Arquitectura: un motor de calendario en Go,
el negocio en NestJS sobre Fastify, PostgreSQL, un frontend React y un gateway nginx, todo en Docker
Compose. Se despliega solo en el VPS de la plataforma de yitztech: GitHub Actions publica las imágenes en
GHCR y Coolify las arranca. Está pensado para que un modelo lo ejecute fase a fase sin tener que adivinar
nada.

## Resumen

- **Cinco contenedores:** `gateway` (nginx), `web` (React 19 + React Router 8 con SSR), `api` (NestJS 12 +
  Fastify 5), `calendar` (Go 1.27) y `postgres` (18). Usan 1,3 GB en total y no hay Redis: las colas viven
  en PostgreSQL.
- **El motor en Go decide todo lo que es tiempo:** horarios, descansos, feriados de unos 200 países,
  disponibilidad, recurrencia, reservas sin doble reserva y sincronización con Google, Outlook y Apple.
- **NestJS decide el negocio:** cuentas con Google o con correo verificado, roles (propietario, editor,
  observador, cliente final), planes Personal (US$5) y Sucursales (US$20, 10 tableros), prueba de 30 días,
  Stripe, avisos por correo, panel, WhatsApp, Slack y Telegram, y MCP.
- **Español e inglés en todo**, con el idioma decidido por el dominio, como pide el README.
- **Embed** del tablero en cualquier landing; diseño responsive y culturalmente neutro.
- **MCP:** cada negocio conecta Claude, ChatGPT o Gemini y gestiona o consulta su sistema en lenguaje natural.
- **Pruebas por escenarios** en Gherkin (español), con varios actores, dos idiomas y varios dispositivos,
  como puerta para desplegar.
- **Producción** cumple el contrato de la plataforma; **desarrollo local** usa el mismo reparto con recarga
  en caliente.
- **Decisiones del 2026-10-06:** solo suscripción (sin cobro por cita); Stripe y WhatsApp se implementan
  pero quedan **sin configurar y sin valores reales**; las copias de seguridad son cosa de la plataforma.

## Documentos

| Documento | Contenido |
|---|---|
| [01-requisitos.md](01-requisitos.md) | Requisitos consolidados, glosario, matriz de permisos, interpretaciones, cambios respecto al estudio, fuera de alcance, preguntas abiertas |
| [02-arquitectura.md](02-arquitectura.md) | Contenedores, responsabilidades, comunicación, datos, flujos (diagramas) y rutas del gateway |
| [03-versiones.md](03-versiones.md) | Versiones verificadas en su fuente el 2026-10-06 y regla para revalidarlas |
| [04-motor-calendario.md](04-motor-calendario.md) | Motor en Go: modelo de datos, disponibilidad, recurrencia, feriados, concurrencia, sincronización, RPC |
| [05-negocio-api.md](05-negocio-api.md) | NestJS: identidad, validación de correo, roles, planes y Stripe, avisos, API REST, seguridad |
| [06-mcp.md](06-mcp.md) | MCP: compatibilidad con Claude, ChatGPT y Gemini; OAuth; herramientas; pruebas |
| [07-frontend.md](07-frontend.md) | React: español e inglés, rutas traducidas, SEO, pantallas, calendario, reserva, embed, diseño |
| [08-infraestructura.md](08-infraestructura.md) | Contrato de la plataforma, `compose.prod.yml`, imágenes, gateway, desarrollo local, variables, CI/CD |
| [09-pruebas.md](09-pruebas.md) | Estrategia de pruebas y pruebas automatizadas por escenarios |
| [10-fases.md](10-fases.md) | Trece fases con tareas, criterios de aceptación y modelo/esfuerzo |
| [11-dayotter.md](11-dayotter.md) | Qué características de DayOtter se aprovechan y cuáles no |

## Decisiones clave

| Tema | Decisión | Motivo |
|---|---|---|
| Entrada única | `gateway` nginx de la plantilla de yitztech | Contrato de la plataforma |
| Frontend | React Router 8 en SSR | Idioma por `Host`, `hreflang`, Open Graph y CSP con nonce en el primer HTML |
| Comunicación interna | Connect RPC con JWT de actor; eventos con outbox en River | Contratos tipados; ningún aviso perdido ni duplicado |
| Datos | Un PostgreSQL, un esquema y un rol por servicio | Aislamiento y una sola copia de seguridad |
| Doble reserva | Restricción `EXCLUDE` por tablero y asiento + bloqueo consultivo | Garantía en la base de datos, con capacidad > 1 |
| Recurrencia | Subconjunto RRULE propio, materializado a 18 meses | Correcto con cambios de horario y protegido por la restricción |
| Feriados | Datos de `date-holidays` generados y embebidos en Go | Cobertura de unos 200 países con regiones |
| Sincronización | Feeds ICS + conexión directa con Google, Microsoft e iCloud; nuestro sistema es la fuente de verdad | Cumple «sincronizar con los tres» sin la complejidad de la bidireccional completa |
| Identidad | Better Auth, una instancia por dominio | Sesiones por dominio; OAuth 2.1 para MCP en la misma pieza |
| Cobro | Solo suscripción. Stripe Embedded Checkout implementado y apagado hasta tener claves; mientras tanto, «Disponible pronto» y la prueba no vence | Decisión del 2026-10-06; activarlo será solo configuración |
| MCP | Dentro de `api`, SDK v2, CIMD + DCR + clientes estáticos | Compatible con Claude, ChatGPT y Gemini Enterprise sin otro contenedor |
| Pruebas | playwright-bdd con Gherkin en español sobre la topología de producción | Escenarios legibles que bloquean despliegues rotos |

## Cómo ejecutar el plan

1. **Una fase por rama** (`fase/f03-identidad`, etc.); las XL pueden ocupar varias sesiones. Orden y
   dependencias en [10-fases.md](10-fases.md); tras F2, las líneas Go y TypeScript pueden ir en paralelo.
2. **Antes de empezar una fase:** leer este README, `01-requisitos.md`, los documentos que cita la fase y
   revalidar en su fuente las versiones de lo que se vaya a instalar.
3. **Durante:** cada prompt que cambie archivos termina con commit y push a la rama de la fase; nunca push
   a `main`. El repositorio es público: ningún secreto ni `.env` real.
4. **Al terminar:** cumplir la lista «Hecho» de [10-fases.md](10-fases.md), pasar `/code-review`, marcar la
   fase abajo y pedir al usuario el PR. `main` solo cambia por PR aprobado por @yprevot, y lo que llega a
   `main` se despliega solo.
5. **Si la realidad contradice el plan** (una API cambió, salió una versión nueva): elegir lo más simple
   que cumpla el requisito, registrar un ADR en `docs/adr/` y actualizar el plan en el mismo PR.

Prompt sugerido para arrancar cada fase:

```text
Ejecuta la fase FNN de docs/plan/10-fases.md. Lee antes docs/plan/README.md, 01-requisitos.md y los
documentos que cita la fase. Revalida las versiones en su fuente. Trabaja en la rama fase/fNN-<nombre>,
con commits pequeños y push al final de cada paso. Termina cuando se cumplan los criterios de aceptación
y la lista «Hecho».
```

## Modelo recomendado para ejecutarlo

**Claude Opus 5.5 con esfuerzo `xhigh` como predeterminado**, bajando a `high` en las fases de menor
riesgo (F0, F1, F6, F7 y F8). Se fija con `/model` y `/effort xhigh` (o `high`) al empezar cada sesión.

| Fases | Modelo y esfuerzo | Por qué |
|---|---|---|
| F2, F3, F4, F5, F9, F10, F11, F12 | Opus 5.5 · `xhigh` | Concurrencia y doble reserva, RRULE y cambios de horario, OAuth 2.1 como servidor, Stripe, tres proveedores de calendario, aislamiento entre clientes y revisión de seguridad: un fallo aquí es una cita a la hora equivocada o datos de un cliente vistos por otro |
| F0, F1, F6, F7, F8 | Opus 5.5 · `high` | Estructura, interfaz y avisos con patrones conocidos; `high` mantiene la calidad con menos tokens |

- **Por qué Opus 5.5 y no Sonnet 5.5:** Opus 5.5 cuesta US$4/US$20 por millón de tokens (entrada/salida)
  frente a US$2/US$10 de Sonnet 5.5, pero en un plan largo y con muchas piezas que encajan entre sí, el
  coste real se mide por tarea terminada: menos retrabajo y menos errores sutiles compensan el precio.
  Ambos tienen 1M de contexto.
- **Por qué `xhigh` y no `max`:** `xhigh` es el ajuste indicado para programación agéntica larga; `max` solo
  compensa en problemas muy difíciles y queda fuera del rango que pediste.
- **Si el presupuesto aprieta:** Sonnet 5.5 en `high` para F6 y F7 (interfaz y textos). Nunca `low` ni
  `medium` para ejecutar fases; sí para tareas sueltas.

## Estado

- [x] F0 · Fundaciones del repositorio
- [x] F1 · Esqueleto desplegable
- [x] F2 · Contratos y comunicación interna
- [x] F3 · Identidad, organizaciones y roles
- [x] F4 · Motor: tableros, horarios, feriados y disponibilidad
- [x] F5 · Motor: eventos, recurrencia, reservas y concurrencia
- [x] F6 · Frontend base en español e inglés
- [x] F7 · Panel, reserva, «Mis citas» y embed (capturas por aprobar; Google para clientes finales pendiente)
- [x] F8 · Avisos multicanal y recordatorios
- [x] F9 · Planes, prueba gratuita y facturación (Stripe listo, sin configurar)
- [x] F10 · Sincronización con Google, Outlook y Apple (el vídeo de verificación de Google lo graba el equipo)
- [ ] F11 · MCP: conecta tu IA
- [ ] F12 · Endurecimiento y lanzamiento
- [ ] F13 · Post-lanzamiento (opcional)

Las decisiones confirmadas y las preguntas abiertas (con su decisión por defecto) están en
[01-requisitos.md §1.9](01-requisitos.md#19-decisiones-confirmadas-y-preguntas-abiertas).

## Fuentes

- [Estudio técnico — MiCitaEnTiempo](https://claude.ai/artifact/HKBaJdGPHFZP1wnP16M1YG) y
  [Requisitos de despliegue](https://claude.ai/code/artifact/b3ce3cb9-e2d6-4db6-a2dc-c9c0046331a3)
- [yitztech/plantilla-cliente](https://github.com/yitztech/plantilla-cliente)
- [Cambios de la especificación MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Conectores MCP para Claude](https://claude.com/docs/connectors/building) ·
  [Autenticación de apps de ChatGPT](https://developers.openai.com/apps-sdk/build/auth) ·
  [Servidores MCP en Gemini Enterprise](https://support.google.com/g/answer/17106276) ·
  [MCP en Gemini CLI](https://geminicli.com/docs/tools/mcp-server/)
- [Plugin MCP de Better Auth](https://better-auth.com/docs/plugins/mcp)
- [React Router v8](https://remix.run/blog/react-router-v8) ·
  [NestJS 12 (InfoQ)](https://infoq.com/news/2026/04/nestjs-12-roadmap-esm)
- [DayOtter](https://github.com/Dayotter/dayotter)
- [Versiones de Go](https://go.dev/dl/) · [Calendario de Node.js](https://github.com/nodejs/Release) ·
  [Versiones de PostgreSQL](https://www.postgresql.org/support/versioning/)
