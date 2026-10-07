# Mi Cita en Tiempo — guía para agentes

Servicio de reservas por suscripción en dos dominios: micitaentiempo.online (es) y
myappointmentontime.online (en). El plan completo está en `docs/plan/`: léelo antes de cada fase
(`docs/plan/README.md`, `01-requisitos.md` y los documentos que cite la fase).

## Servicios

| Carpeta | Servicio | Tecnología |
|---|---|---|
| `services/gateway` | Entrada única (puerto 80) | nginx 1.30 |
| `services/web` | Páginas, panel, reserva, embed (SSR) | React 19 + React Router 8, Node 24 |
| `services/api` | Negocio, identidad, avisos, MCP | NestJS 12 + Fastify 5, TypeScript 6 |
| `services/calendar` | Motor de calendario | Go 1.27 |
| `services/postgres` | Base de datos | PostgreSQL 18 |
| `packages/*` | Contratos, esquemas Zod, i18n, tsconfig | TypeScript 7 (debe compilar con 6) |
| `tests/escenarios` | Pruebas por escenarios (Gherkin en español) | playwright-bdd |

## Comandos

```bash
pnpm install
docker compose up --watch        # desarrollo local en http://micitaentiempo.localhost:8080
pnpm lint && pnpm typecheck && pnpm test
(cd services/calendar && go test ./...)
pnpm escenarios
```

## Reglas

- El repositorio es **público**: nunca se suben secretos, `.env` reales ni claves. Las claves de terceros
  (Stripe, WhatsApp…) quedan vacías hasta que el usuario decida configurarlas.
- Contrato de la plataforma (`README.md` y `docs/plan/08-infraestructura.md` §8.1): `compose.prod.yml`
  sin `ports:` ni `build:`, `mem_limit` en todo servicio, configuración dentro de las imágenes.
- El idioma lo decide el dominio, nunca `Accept-Language` ni la IP. Todo texto visible vive en
  `packages/i18n` en es y en.
- Fechas en UTC en la base de datos; reglas de pared (horarios) como hora local + zona IANA.
- Versiones: última estable verificada en su fuente; ver `docs/plan/03-versiones.md`.
- Cada cambio de comportamiento lleva su prueba; cada requisito, su escenario.
- Decisiones de arquitectura nuevas: un ADR en `docs/adr/`.
