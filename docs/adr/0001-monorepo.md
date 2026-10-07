# 0001-monorepo. Monorepo pnpm con módulo Go

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Hay tres aplicaciones (web, api, calendar) que comparten contratos, esquemas e i18n, y un solo repositorio exigido por la plataforma.

## Decisión

Monorepo con workspaces de pnpm para TypeScript (`services/web`, `services/api`, `packages/*`) y un módulo Go independiente en `services/calendar`.

## Consecuencias

Un PR puede cambiar el contrato y sus dos lados a la vez. CI separa trabajos de TypeScript y Go.
