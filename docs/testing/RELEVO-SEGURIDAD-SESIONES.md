# Relevo — seguridad de sesiones y suscripciones

Fecha: 2026-11-02 (hora local). PR: https://github.com/yitztech/micitaentiempo.online/pull/23

- Rama: `fix/seguridad-sesiones-suscripcion`.
- Commit revisado: `eba8e31282cef9dc7ffc05bfb5f0dcf7330a0726`.
- El PR está en borrador. No se ha verificado el despliegue ni se ha autorizado su merge.

## Estado comprobado

- Localmente pasaron `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:calendar:unit` y las compilaciones de API y web. Pasaron también las pruebas unitarias específicas de autorización y recuperación de la sincronización.
- En la consulta de CI del PR, TypeScript, Go, base de datos, contratos, nginx, gitleaks y Trivy estaban en verde. Una ejecución de «Imágenes y escenarios (2/4)» había terminado bien; los demás trabajos de imágenes y escenarios seguían ejecutándose. Comprobar el estado actual y el SHA antes de darlo por válido.
- No se ejecutaron localmente los escenarios Gherkin de seguridad y facturación: Docker dejó de responder durante la reconstrucción. El puerto de Mailpit del entorno de pruebas es `18025`; `8025` pertenecía a otro proyecto local.
- La prueba unitaria de reintento usa un doble. Falta comprobar con PostgreSQL y el motor reales que la migración `0012_calendar_status_pending.sql` aplica en una base existente y que el marcador sobrevive a un fallo del RPC, se reintenta y refleja el estado correcto.

## Pasos para mañana

1. Comprobar que se sigue en la rama y el commit correctos y revisar el PR y todos los checks:

   ```sh
   git status --short --branch
   gh pr view 23 --json url,isDraft,headRefOid,mergeStateStatus,statusCheckRollup
   gh pr checks 23
   ```

2. Revisar cualquier fallo de CI y sus logs. Confirmar explícitamente si los trabajos de imágenes ejecutaron los escenarios nuevos y la migración; un trabajo de base de datos en verde por sí solo no demuestra la recuperación ante fallo entre servicios.
3. Recuperar Docker y arrancar el entorno aislado con las imágenes del commit actual. Comprobar que los puertos 8080, 18025, 4010 y 5232 están libres antes de arrancarlo; no detener servicios de otros proyectos.

   ```sh
   docker info
   pnpm test:env:up
   pnpm --filter @mcet/escenarios typecheck
   pnpm --filter @mcet/escenarios exec playwright test --project backend --grep '@seguridad'
   pnpm --filter @mcet/escenarios exec playwright test --project reloj --grep 'Un pago fallido pasa'
   ```

4. Añadir y ejecutar una prueba de integración con PostgreSQL y el motor que provoque un fallo de `setOrgStatus`, compruebe que el marcador sigue pendiente y verifique el reintento, incluidos cambios consecutivos de estado. Confirmar que el motor deja de aceptar escrituras y reservas en `read_only` y recupera el acceso al reactivarse.
5. Validar con sesiones reales la renovación de cookies en una carga SSR, navegación y redirección; verificar aislamiento de cuentas, logout independiente y acceso a recursos ajenos. Las pruebas unitarias existentes no demuestran el flujo completo.
6. Corregir los fallos, volver a ejecutar los checks afectados y actualizar el PR con los resultados. Solo cuando las comprobaciones requeridas estén completas debe retirarse el estado de borrador; el merge y despliegue requieren el flujo de revisión del repositorio.
