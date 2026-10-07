# 0010-mcp-en-api. MCP dentro de api

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Los negocios quieren usar Claude, ChatGPT y Gemini sin coste de IA para la plataforma.

## Decisión

Servidor MCP con el SDK v2 dentro de `api`; Better Auth como servidor OAuth con CIMD, DCR y clientes estáticos.

## Consecuencias

Sin contenedor extra; las herramientas reutilizan los servicios de la API.
