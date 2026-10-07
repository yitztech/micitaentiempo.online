# 0002-cinco-contenedores. Cinco contenedores y gateway nginx

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

El contrato exige un servicio `gateway` en el puerto 80, único con dominio, y `mem_limit` en todo.

## Decisión

`gateway` (nginx de la plantilla), `web`, `api`, `calendar` y `postgres`. Sin Redis.

## Consecuencias

Total de 1 312 MiB. Todo estado durable en PostgreSQL.
