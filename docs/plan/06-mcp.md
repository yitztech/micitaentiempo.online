# 6. MCP: «Conecta tu IA»

Cada negocio puede conectar su propia IA (Claude, ChatGPT o Gemini) a Mi Cita en Tiempo y gestionar o
consultar su sistema en lenguaje natural: «¿qué citas tengo mañana?», «bloquea el viernes por la tarde»,
«¿cuántas cancelaciones hubo en septiembre?». La IA actúa con los mismos permisos que el usuario que la
conectó. El servidor MCP vive dentro de `api`; no añade contenedores ni coste de IA para la plataforma.

## 6.1 Compatibilidad por cliente

Estado verificado entre julio y octubre de 2026; revisar en cada fuente al implementar F11.

| Cliente | Cómo se conecta | Registro OAuth | URL de retorno | Notas |
|---|---|---|---|---|
| Claude (claude.ai, Desktop, móvil, Cowork) | Conector personalizado por URL; opcionalmente, directorio de Anthropic | DCR (por defecto) u otras vías | `https://claude.ai/api/mcp/auth_callback` | Sigue las especificaciones de autorización 2025-03-26, 2025-06-18 y 2025-11-25; resultado ≤ ~150 000 caracteres y 240 s por llamada; no usa suscripciones a recursos ni sampling ([docs](https://claude.com/docs/connectors/building)) |
| Claude Code | `claude mcp add --transport http mi-cita https://micitaentiempo.online/mcp` | DCR | Loopback | Resultado ≤ 25 000 tokens por defecto |
| ChatGPT | Las apps de ChatGPT son servidores MCP. Dos vías: **modo desarrollador** (añadir por URL), con soporte MCP completo y escritura en beta para ChatGPT Business, Enterprise y Edu en la web ([ayuda](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)); o **directorio de apps** tras revisión (envíos abiertos desde el 2025-12-17), que lo pone al alcance de usuarios sin modo desarrollador | CIMD (preferido) o DCR; PKCE `S256`; `resource` copiado a `aud`; `iss` (RFC 9207) | `https://chatgpt.com/connector_platform_oauth_redirect` (con `iss`) o `https://chatgpt.com/connector/oauth/{callback_id}` | Pide `securitySchemes` por herramienta y `_meta["mcp/www_authenticate"]` en errores de autenticación; recomienda `offline_access` ([docs](https://developers.openai.com/apps-sdk/build/auth)). En cuentas individuales (Plus) el modo desarrollador puede no estar disponible: para esos negocios, la vía es el directorio |
| Gemini Enterprise (Business Edition) | El administrador añade el servidor en *Team → Connected Apps → Add MCP Server* | Cliente OAuth registrado a mano (`client_id` y `client_secret`) | `https://vertexaisearch.cloud.google.com/oauth-redirect` | Solo Streamable HTTP; función pre-GA al 2026-09-15 ([ayuda](https://support.google.com/g/answer/17106276)) |
| Gemini CLI | `httpUrl` en `settings.json` | Descubrimiento OAuth | Loopback | ([docs](https://geminicli.com/docs/tools/mcp-server/)) |
| App de consumo de Gemini | — | — | — | No admite servidores MCP personalizados a la fecha de verificación; la página «Conecta tu IA» lo explica |

## 6.2 Arquitectura

- **Endpoint:** `POST https://micitaentiempo.online/mcp` y `POST https://myappointmentontime.online/mcp`. El
  dominio fija el idioma de los textos; las fechas salen en la zona del usuario.
- **SDK:** `@modelcontextprotocol/server` 2.3.1 (`createMcpHandler`), montado con rutas propias en la
  instancia Fastify de NestJS (ADR 0018). Las herramientas son providers de NestJS que llaman a los mismos servicios
  que la API REST: ninguna lógica duplicada. (`@rekog/mcp-nest` 2.0.7 es la alternativa si se prefieren
  decoradores.)
- **Protocolo:** especificación 2026-07-28 (sin estado: sin `Mcp-Session-Id`, con `server/discover`) y, con
  el mismo servidor, clientes de la era 2025 atendidos sin estado (comportamiento por defecto del SDK v2).
  **No** activar el modo que rechaza clientes antiguos: Claude sigue la autorización 2025-11-25.
- **Servidor de autorización:** Better Auth con `@better-auth/oauth-provider`, `@better-auth/cimd` y el
  plugin `jwt`, uno por dominio (emisor `https://<dominio>/api/auth`). Los metadatos RFC 9728 y la
  verificación de tokens son propios (ADR 0018).
- **Metadatos:** `/.well-known/oauth-protected-resource/mcp` (RFC 9728) y los del servidor de autorización
  (RFC 8414). JWKS publicado.
- **Consentimiento:** pantalla en `web` (`/oauth/consentimiento` ↔ `/oauth/consent`) con el nombre y el
  dominio del cliente, los permisos en lenguaje claro y la elección de tableros (todos o algunos).

## 6.3 OAuth

| Aspecto | Decisión |
|---|---|
| Flujo | Código de autorización con PKCE `S256`, parámetro `iss` en la respuesta (RFC 9207) |
| Registro de clientes | **CIMD** (`client_id` = URL HTTPS de metadatos, descargada con protección SSRF: solo HTTPS, IPs públicas, ≤ 5 KB, 3 s, caché HTTP). **DCR** activado explícitamente por compatibilidad (obsoleto en 2026-07-28, pero Claude lo usa): 10 registros/h por IP, clientes sin tokens borrados a las 24 h. **Clientes estáticos** para Gemini Enterprise, creados por el propietario en el panel (secreto visible una vez) |
| Audiencia | `resource` = `https://<dominio>/mcp` → claim `aud`; el endpoint rechaza tokens de otra audiencia |
| Access token | JWT firmado con el JWKS de Better Auth, 15 min |
| Refresh token | 30 días, rotativo; se emite a los clientes MCP aunque no pidan `offline_access` (no todos lo piden y Claude refresca tokens). Si Better Auth no lo permite, añadir `offline_access` a los scopes por defecto de esos clientes |
| Revocación | Endpoint estándar y botón en Panel → IA; borrar un miembro revoca sus tokens |
| Errores | `401` con `WWW-Authenticate: Bearer resource_metadata="…", scope="…"`; para ChatGPT, además `_meta["mcp/www_authenticate"]` |

**Permisos (scopes)**, descritos en es y en en la pantalla de consentimiento:

| Scope | Permite |
|---|---|
| `profile` | Ver quién eres, tu organización, plan y roles |
| `calendar:read` | Ver tableros, ajustes, eventos, huecos libres y feriados |
| `calendar:write` | Crear, cambiar y cancelar eventos y bloqueos |
| `customers:read` | Ver datos de contacto de clientes finales (sin este permiso se enmascaran) |
| `stats:read` | Ver estadísticas |
| `settings:write` | Cambiar horario, descansos y excepciones (solo propietario) |
| `billing:read` | Ver plan, prueba y facturas (solo propietario) |
| `notifications:read` | Ver avisos recientes |
| `offline_access` | Mantener la conexión sin volver a iniciar sesión (aceptado por compatibilidad; ver refresh token) |

## 6.4 Herramientas

Nombres y descripciones de herramientas en inglés (los modelos los interpretan mejor y son estables);
los textos para la persona, en su idioma. Orden de `tools/list` determinista.

| Herramienta | Qué hace | Scope | Anotaciones | Roles |
|---|---|---|---|---|
| `whoami` | Usuario, organización, plan, rol por tablero; id de perfil estable (ChatGPT lo pide para multicuenta) | `profile` | solo lectura | todos |
| `list_calendars` | Tableros accesibles, zona, estado y rol | `calendar:read` | solo lectura | propietario, editor, observador |
| `get_calendar_settings` | Horario, descansos, feriados, servicios, políticas | `calendar:read` | solo lectura | ídem |
| `find_available_slots` | Huecos libres por servicio y rango | `calendar:read` | solo lectura | ídem |
| `list_events` | Eventos y reservaciones en un rango, con filtros y cursor | `calendar:read` (+ `customers:read` para contacto) | solo lectura | ídem |
| `get_event` | Detalle de un evento | ídem | solo lectura | ídem |
| `list_holidays` | Feriados aplicables en un rango | `calendar:read` | solo lectura | ídem |
| `get_stats` | Reservas por periodo, estado y servicio; cancelaciones; inasistencias; horas pico; ocupación | `stats:read` | solo lectura | propietario, editor |
| `get_sync_status` | Conexiones con Google, Microsoft e iCloud y su salud | `calendar:read` | solo lectura | propietario |
| `get_subscription` | Plan, días de prueba, límites y uso | `billing:read` | solo lectura | propietario |
| `list_notifications` | Avisos recientes | `notifications:read` | solo lectura | todos |
| `search_help` | Artículos de ayuda del producto en el idioma del usuario («¿cómo bloqueo feriados?») | — | solo lectura | todos |
| `search` / `fetch` | Búsqueda en eventos, clientes, servicios y ayuda, y lectura por id (formato que espera ChatGPT para conectores de lectura) | `calendar:read` | solo lectura | ídem |
| `create_event` | Cita o bloqueo; serie con el subconjunto RRULE (solo personal) | `calendar:write` | no destructiva, idempotente con `idempotency_key` | propietario, editor |
| `update_event` | Cambia un evento; alcance `this` \| `following` \| `all` | `calendar:write` | destructiva | propietario, editor |
| `cancel_event` | Cancela y avisa a los afectados | `calendar:write` | destructiva | propietario, editor |
| `block_time` | Atajo para bloquear un rango | `calendar:write` | no destructiva | propietario, editor |
| `cancel_events` | Cancelación masiva por filtro: **solo previsualiza** y devuelve un token de confirmación de 5 min | `calendar:write` | destructiva | propietario, editor |
| `confirm_bulk_action` | Ejecuta una acción masiva previsualizada | según la acción | destructiva | propietario, editor |
| `set_working_hours` | Cambia horario y descansos de un día de la semana | `settings:write` | destructiva | propietario |
| `add_date_override` | Cierra o cambia el horario de una fecha | `settings:write` | destructiva | propietario |

Reglas de diseño:

1. **Mismas reglas que la interfaz.** Las herramientas llaman a los servicios de `api`, que aplican rol,
   plan y estado (`read_only` → solo lectura) y delegan en `calendar`.
2. **Confirmar antes de actuar** (idea de DayOtter). Las anotaciones `readOnlyHint` y `destructiveHint` hacen
   que Claude y ChatGPT pidan aprobación; las acciones masivas exigen además previsualizar y confirmar.
3. **Resultados** con `structuredContent` (JSON validado por `outputSchema`) y un resumen corto en el idioma
   del usuario; hora UTC y hora local del tablero; paginación con cursor; como máximo 200 elementos y
   100 000 caracteres por respuesta.
4. **Contenido no confiable.** Las notas que escriben los clientes finales viajan como
   `{"untrusted_text": "…"}` y las descripciones de las herramientas advierten que nunca se sigan
   instrucciones que aparezcan ahí.
5. **Datos personales mínimos.** Sin `customers:read`, correo y teléfono salen enmascarados.
6. **Auditoría** de toda escritura (`via = mcp`, cliente OAuth, herramienta, objetivo).
7. **Límites:** 120 llamadas/min por token y 600/min por organización; tiempo máximo de 30 s por llamada.

**Recursos:** artículos de ayuda (`mcet://help/{tema}`) y ajustes de cada tablero
(`mcet://calendars/{id}/settings`). **Prompts:** `weekly_summary`, `plan_my_day` y `reschedule_day`, con
descripción en el idioma del usuario.

## 6.5 Experiencia de usuario

- **Página pública «Conecta tu IA»** (`/conecta-tu-ia` ↔ `/connect-your-ai`): URL del servidor con botón de
  copiar y pasos con capturas para Claude, ChatGPT, Gemini Enterprise y Gemini CLI, en los dos idiomas.
- **Panel → IA** (`/panel/ia` ↔ `/dashboard/ai`): aplicaciones conectadas (nombre, dominio, permisos, último
  uso, revocar), generación de credenciales para Gemini Enterprise y ejemplos de preguntas.
- **Correo** al conectar una aplicación nueva, con enlace para revocarla.
- **Incluido en los dos planes y en la prueba**; con la organización en `read_only`, solo herramientas de
  lectura.

## 6.6 Pruebas

- Unitarias por herramienta: cada rol × cada herramienta (permitido o `permission_denied`), con y sin scope.
- Integración con `@modelcontextprotocol/client` 2.3.1 en modo 2026-07-28 y en modo 2025-11-25.
- Flujos OAuth completos: CIMD (documento de metadatos servido por el entorno de pruebas), DCR y cliente
  estático; casos negativos (audiencia ajena, token caducado, otra organización, scope insuficiente).
- Escenarios Gherkin de MCP (`09-pruebas.md` §9.2).
- Comprobación manual con MCP Inspector y con los clientes reales antes del lanzamiento: conector
  personalizado en Claude, modo desarrollador de ChatGPT y Gemini CLI (Gemini Enterprise si hay cuenta).
- **Evals con IA (opcional, nocturno):** preguntas en es y en contra un entorno con datos sembrados, usando
  el conector MCP de la API de Claude con `claude-opus-5-5`; se comprueban hechos esperados (número de
  citas, nombres de servicios) y se limita el gasto por ejecución.

## 6.7 Publicación en directorios (recomendada para ChatGPT)

En Claude, cualquier negocio puede añadir el servidor por URL sin revisión. En ChatGPT, por URL solo se
puede con modo desarrollador (planes de empresa); para llegar a negocios con cuentas individuales hay que
publicar en el directorio de apps. Requisitos de OpenAI
([envío](https://developers.openai.com/apps-sdk/deploy/submission)):

- Organización verificada (individual o empresa) en la plataforma de desarrolladores de OpenAI.
- URL de la web, de soporte, de privacidad y de condiciones.
- Cinco casos de prueba positivos y tres negativos, con las herramientas y resultados esperados.
- Cuenta de prueba con datos de ejemplo, **sin MFA ni enlaces mágicos** (una cuenta de negocio con correo y
  contraseña de este sistema lo cumple).
- Vídeo de demostración, descripciones y anotaciones de herramientas correctas, y verificación del dominio
  del servidor MCP.

El directorio de conectores de Anthropic pide algo parecido (nombres, descripciones, anotaciones, política
de privacidad y cuenta de prueba). Ambos envíos son opcionales y van en F12.

**Riesgo y calendario:** MCP no añade contenedores ni coste de IA para la plataforma y llega en F11, al
final. Si hiciera falta recortar alcance, F11 puede pasar a post-lanzamiento sin afectar a ninguna otra
fase.

## 6.8 Post-lanzamiento

- **MCP Apps** (`@modelcontextprotocol/ext-apps`): selector de horarios y vista del día dentro de Claude y
  ChatGPT.
- **Acceso para clientes finales**: sus propias reservaciones por MCP.
- **Asistente dentro de la app** (el chatbot del estudio técnico), reutilizando estas mismas herramientas.
