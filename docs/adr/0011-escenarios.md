# 0011-escenarios. Pruebas por escenarios con playwright-bdd

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

Los requisitos deben ser verificables en los dos idiomas, con varios actores y dispositivos.

## Decisión

Gherkin en español ejecutado por playwright-bdd sobre `compose.prod.yml` + `compose.ci.yml`.

## Consecuencias

Los escenarios bloquean la publicación de imágenes.
