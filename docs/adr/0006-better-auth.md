# 0006-better-auth. Better Auth por dominio

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Las sesiones deben ser por dominio y MCP necesita un servidor OAuth 2.1.

## Decisión

Better Auth con una configuración por dominio (es y en), misma base de datos.

## Consecuencias

Cookies `__Host-` por dominio; plugins oauth-provider, mcp y cimd para MCP.
