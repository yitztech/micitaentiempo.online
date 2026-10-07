# 0007-react-router-ssr. React Router 8 con SSR

- Estado: aceptada
- Fecha: 2026-10-06

## Contexto

El idioma, `hreflang`, Open Graph y la CSP con nonce deben salir en el primer HTML.

## Decisión

React Router 8 en modo framework con SSR sobre Node 24.

## Consecuencias

`web` ejecuta Node (192 MiB) en vez de servir estáticos.
