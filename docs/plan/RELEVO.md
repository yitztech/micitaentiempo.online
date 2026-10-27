# Relevo — perfiles, directorio y apps sin internet

Fecha: 2026-10-27. Rama: `feat/perfiles-directorio-offline`.

**Estado real: C0 implementado; C1 parcial; C2–C9 (incluidas C8a/b/c) pendientes.**
No existe todavía directorio/panel nuevo ni persistencia offline en las apps. No confundir contratos,
tablas o pruebas de repositorio con funcionalidad completa. No se hicieron push, merge ni despliegue.
El porcentaje de consumo de la cuenta no está disponible para el agente; no se verificó el umbral del 10 %.

## Para continuar

Leer AGENTS.md, README.md, `docs/plan/12-perfiles-negocios-directorio.md` (especialmente §8.1 y §12)
y `docs/adr/0019-perfiles-directorio-offline.md`; inspeccionar Git antes de editar. Mantener la rama
actual o crear una rama desde su HEAD. La lista detallada de archivos/pendientes está en §12 del plan.

**Siguiente tarea concreta: cerrar C1**, sin empezar aún pantallas ni instalar paquetes:

1. Añadir revisión monótona y snapshots de calendario/servicios en Go, incluidos tombstones de baja.
2. Emitir snapshots en la misma transacción por la outbox existente y conectar EventIngress con
   `BusinessProfileRepository.applyCalendarSnapshot`; distinguir versión de formato y de agregado.
3. RPC autorizado/paginado y reconciliación acotada con checkpoint. Recuperar membresía/perfil si el
   alta RPC se confirmó pero falló la escritura local; evitar crear otro calendario al recuperar.
4. Probar creación normal y recuperación, eventos desordenados/repetidos, cambios de servicios,
   baja del último calendario, aislamiento y caída RPC. El backfill actual solo conoce membresías locales.
5. Ampliar pruebas de publicación/lectura canónica al introducir C2/C4. No exponer filas privadas como DTO público.

Después: C2 API privada → C3 imágenes/almacenamiento → C4/C5 búsqueda → C6/C7 web/panel → C8 apps →
C8a almacenamiento cifrado offline → C8b cola/sync/idempotencia → C8c evidencia nativa → C9 cierre integral.
Dependencias nuevas requieren autorización específica según AGENTS/plan; ninguna instalada aquí.

## Evidencia ejecutada

- `pnpm test:unit`: 267 pruebas aprobadas (63 esquemas/móvil, 13 i18n, 170 API, 7 admin, 14 web).
- `pnpm --filter @mcet/api exec vitest run --config vitest.database.config.ts`: 26 pruebas aprobadas,
  con PostgreSQL 18.6 temporal real, migración desde vacío (suite existente) y desde versión anterior
  (suite nueva), FKs, aislamiento, cuotas concurrentes, borradores/backfill y tombstones.
- `pnpm typecheck`: aprobado, incluidos generación BDD y tipado web/móvil del comando raíz.
- `pnpm --filter @mcet/api build`: aprobado.
- `pnpm i18n:check`: aprobado en los seis idiomas; no se añadió interfaz visible que traducir.
- `pnpm lint`: aprobado con 5 advertencias y 7 avisos informativos en archivos anteriores no modificados
  (`services/admin/public/app.js`, `services/api/src/notifications/delivery.worker.ts`, `services/web/app/app.css`).
  Las comprobaciones de los archivos modificados no tienen diagnósticos.
- `pnpm --filter @mcet/api db:generate`: no detecta diferencias con la metadata actual.
- Tras el último ajuste del DTO de imágenes a URLs relativas, se repitieron build de paquetes,
  generación/comprobación OpenAPI y las 63 pruebas de `test:schemas`.
- `git diff --check`: aprobado.

Las suites de contratos imprimen `adb: command not found` al probar el driver; son pruebas con dobles,
y pasan. **No hay evidencia nativa Android/iOS.** No se ejecutaron `test:all`, escenarios funcionales
completos, pruebas Go ni builds nativos para esta entrega. El motor Go no se modificó. La integración
real del flujo de crear calendario con el perfil queda por cubrir al cerrar C1.

## Detalles que evitan repetir errores

- `openapi.yaml` contiene JSON válido como YAML 1.2. Regenerar tras compilar con
  `pnpm --filter @mcet/schemas openapi`; `test:schemas` exige que esté al día. Es diseño, no endpoints activos.
- Gherkin nuevo en `docs/plan/acceptance/negocios-offline.feature` es especificación sin ejecutar,
  fuera del glob de suites. Trasladar con steps reales por tarea; no desactivar verificaciones existentes.
- Nuevos límites: puntos de código/`varchar`; contratos previos: UTF-16. `app.valid_text` se usa con
  techo 2× como filtro de caracteres, y `varchar(n)` fija el límite lógico. No cambiar los previos de paso.
- Migración 0008 nueva: índices únicos compuestos deben ir antes de sus FKs. Constantes SQL DDL se
  emiten como literales controlados (`sql.raw(String(constante))`), nunca `$1`. Metadata consistente;
  las funciones/triggers de cuota y semillas se añaden manualmente a la migración nueva.
- `BusinessBackfill`: una página/60 s, checkpoint en `app.system_info`; no publica automáticamente.
  Membresía y perfil se escriben en la misma transacción después del RPC de creación de calendario.
- TTL offline propuesto 24 h; cola 100 operaciones, envío máximo 24 h y recibos 90 días; detalles y
  tratamiento de holds/ALTCHA, conflictos, datos privados y dependencias en ADR 0019.
- No garantizar disponibilidad ni cancelación antes de confirmación del servidor. No guardar tokens
  de hold/OTP en la cola. El modo offline actual de la app sigue siendo solo un aviso de conexión.
