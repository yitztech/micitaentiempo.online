# 0018. Servidor MCP sin estado y OAuth 2.1 con Better Auth

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

F11 conecta Claude, ChatGPT y Gemini al sistema por MCP (`docs/plan/06-mcp.md`). El plan proponía
`@better-auth/mcp` y `@modelcontextprotocol/fastify`. Al implementarlo:

- `@better-auth/mcp` exige que el recurso sea HTTPS salvo en `localhost` exacto; los dominios de desarrollo
  y pruebas (`micitaentiempo.localhost`) no pasan, y su verificación de tokens descarga el JWKS por HTTP de
  la URL pública (que dentro del contenedor no siempre resuelve).
- `@modelcontextprotocol/fastify` solo aporta validación de Host/Origin para servidores locales; el gateway
  ya fija los hosts válidos y `/mcp` exige Bearer.
- Muchos clientes de escritorio y CLI se registran (DCR) con retorno loopback sin `application_type`, que
  Better Auth trata como «web» y rechaza.

## Decisión

- **Servidor de autorización:** Better Auth por dominio con `jwt` + `@better-auth/oauth-provider` +
  `@better-auth/cimd` (perfil `mcp-2026-07-28`). Emisor `https://<dominio>/api/auth`; recurso
  `https://<dominio>/mcp` registrado como `resources` y por defecto en los clientes nuevos. Access token
  JWT de 15 min, refresh token de 30 días rotativo (reutilización de 30 s, como hace `@better-auth/mcp`).
- **Registro:** CIMD con el transporte SSRF de `@better-auth/cimd/node`; DCR abierto con 10 registros/h
  por IP y limpieza horaria de los clientes sin uso a las 24 h; si un cliente registra solo retornos
  loopback o de esquema propio sin `application_type`, se le asigna `native` (RFC 8252). Clientes estáticos
  (Gemini Enterprise) creados por el propietario desde Panel → IA con el endpoint de administración.
- **Metadatos propios:** `api` sirve `/.well-known/oauth-protected-resource[/mcp]` (RFC 9728) y reexpone
  los metadatos del servidor de autorización (RFC 8414 y OIDC) desde Better Auth.
- **Verificación local de tokens:** firma con el JWKS leído de la base de datos (caché de 60 s), emisor y
  audiencia del dominio, caducidad; además, la conexión debe seguir vigente en `mcp_grants` (revocar en el
  panel corta el acceso al momento, sin esperar a que caduque el JWT).
- **Transporte:** `createMcpHandler` del SDK v2 (2026-07-28) con el modo por defecto que atiende sin estado
  a los clientes de la era 2025 (no `reject`). Rutas Fastify propias fuera del prefijo `/api`; cada POST se
  responde completo (un intercambio por petición) y solo los GET de suscripción se reenvían como flujo.
- **Herramientas** como funciones que llaman a los mismos servicios y controladores de la API REST con un
  usuario `via = "mcp"` limitado a los tableros elegidos en el consentimiento. Errores como resultado de
  herramienta (`isError`) en el idioma del dominio; falta de permiso OAuth con
  `_meta["mcp/www_authenticate"]` (ChatGPT) en vez de 403 de transporte.

## Consecuencias

Funciona igual en desarrollo (`*.localhost`, HTTP) que en producción, sin red para verificar tokens y sin
dependencias que no se usan. A cambio, los metadatos RFC 9728 y la verificación son código nuestro, cubierto
por los escenarios de `tests/escenarios/features/mcp`. Si `@better-auth/mcp` admite dominios `.localhost`,
se puede volver a él sin cambiar el contrato público.
