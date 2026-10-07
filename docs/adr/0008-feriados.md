# 0008-feriados. Feriados generados con date-holidays

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

`rickar/cal` solo cubre 45 países.

## Decisión

`tools/holidays-gen` genera datos por país (año actual −1 a +5) desde `date-holidays`, embebidos en Go y cargados bajo demanda.

## Consecuencias

Regeneración anual por workflow; atribución CC-BY-3.0 en /creditos.
