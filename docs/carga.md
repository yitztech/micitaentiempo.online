# Prueba de carga (F12)

`tests/carga/carga.js` (k6 2.3.0) sobre `compose.prod.yml` + `compose.ci.yml`, con los límites de memoria
de producción. Se repite cada noche (`.github/workflows/nocturno.yml`).

Mezcla por iteración: 40 % disponibilidad pública, 20 % página de inicio (SSR), 20 % página de reserva (SSR)
y 20 % eventos del panel con sesión. Rampa a 30 usuarios, 2 min, rampa a 60, 1 min.

## Resultado del 2026-10-07 (equipo de desarrollo)

| Métrica | Valor | Umbral |
|---|---|---|
| Peticiones | 9 481 (36 req/s sostenidas) | — |
| Errores | 0 % | < 1 % |
| p95 API | 18 ms | < 500 ms |
| p95 páginas | 38 ms | < 800 ms |

| Servicio | Memoria máxima / límite | CPU máxima |
|---|---|---|
| api | 160 / 384 MiB | 27 % |
| web | 102 / 192 MiB | 27 % |
| calendar | 33 / 160 MiB | 4 % |
| postgres | 59 / 512 MiB | 5 % |
| gateway | 5 / 64 MiB | 2 % |

Holgura amplia en todos los servicios: no hace falta cambiar los límites del §8.2. PostgreSQL queda con
60 conexiones (`api` 15 + `calendar` 10 en sus pools), `shared_buffers` de 128 MB y registro de consultas de
más de 500 ms. Las altas y entradas usan Argon2id (19 MiB por hash) limitadas a 4 a la vez en `api`.

Para repetirla en local:

```bash
docker run --rm --add-host micitaentiempo.localhost:host-gateway --add-host mailpit:host-gateway \
  -v "$PWD/tests/carga:/carga" grafana/k6:2.3.0 run /carga/carga.js
```
