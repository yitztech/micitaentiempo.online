# ADR 0021 — Conciliación de suspensiones históricas desde el panel

**Estado:** aceptada. **Fecha:** 2026-11-04.

## Contexto

`organizations.status` ahora guarda solo la situación económica; la suspensión se deriva de
`app.user_restrictions`. Las restricciones importadas de instalaciones antiguas dejaron `suspended` en la
organización sin conservar el estado económico anterior, y quedaron con `reconciliation_required`. Ese indicador
impide desbloquear (409), pero no había forma de limpiarlo sin SQL manual.

## Decisión

`POST /api/users/:id/reconcile` y un botón en la lista de bloqueados. Quien revisó la causa declara el estado
económico (`trialing`, `active`, `past_due` o `read_only`) y el motivo.

- El sistema nunca deduce el estado: el valor anterior se perdió y adivinarlo podría regalar `active`.
- La cuenta sigue bloqueada; desbloquear es un paso aparte, con su propia decisión.
- Solo cambian organizaciones vivas en `suspended`. Las cerradas se quedan como están.
- Repetirla no cambia nada, ni siquiera con otro estado.
- Se audita en PostgreSQL (`user.restriction.reconciled`) y en el registro del panel.

## Alternativa descartada

Un procedimiento con SQL manual: no deja auditoría uniforme ni valida el estado, y exige acceso a la base de datos.
