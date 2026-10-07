# Verificación manual de MCP (antes del lanzamiento)

Los escenarios de `tests/escenarios/features/mcp` cubren OAuth (CIMD, DCR, consentimiento, revocación) y las
herramientas con un cliente MCP real. Falta probar con los clientes de verdad, que necesitan el servidor en
un dominio público con HTTPS. Firmar cada fila con fecha y quién lo probó.

URL del servidor: `https://micitaentiempo.online/mcp` (es) y `https://myappointmentontime.online/mcp` (en).
Cuenta de prueba: un negocio con datos de ejemplo, correo y contraseña, **sin 2FA** (los directorios de
OpenAI y Anthropic lo piden así).

| Cliente | Pasos | Comprobar | Fecha · quién |
|---|---|---|---|
| MCP Inspector (`npx @modelcontextprotocol/inspector`) | Transporte «Streamable HTTP», URL del servidor, «Open Auth Settings» → flujo completo | Descubrimiento sin errores, DCR, consentimiento, `tools/list`, una llamada de lectura y otra de escritura | |
| Claude (claude.ai) | Ajustes → Conectores → Añadir conector personalizado | Conecta (DCR), pide permisos y tableros, «¿qué citas tengo mañana?», crear un bloqueo pide aprobación | |
| Claude Code | `claude mcp add --transport http mi-cita <URL>` y `/mcp` → Autenticar | Retorno loopback aceptado; refresco del token tras 15 min | |
| ChatGPT (modo desarrollador) | Ajustes → Apps y conectores → Avanzado → crear app con OAuth | CIMD o DCR; `iss` en el retorno; `search`/`fetch`; un permiso que falte devuelve el desafío y ChatGPT lo pide | |
| Gemini CLI | `httpUrl` en `settings.json` y `/mcp auth` | Descubrimiento OAuth y una llamada | |
| Gemini Enterprise (si hay cuenta) | Panel → IA → crear credenciales; Team → Connected Apps → Add MCP Server | Cliente estático con secreto; una llamada | |

Además:

- [ ] Revocar en Panel → IA corta la aplicación al momento (la siguiente llamada da 401).
- [ ] Llega el correo «Nueva aplicación de IA conectada» con el enlace a Panel → IA.
- [ ] Con la organización en `read_only`, las herramientas de escritura responden con el aviso de solo lectura.
- [ ] Las respuestas llegan en el idioma del dominio y con la hora local del tablero.
