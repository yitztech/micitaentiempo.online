# 0014. Panel con loaders del servidor, SSE como aviso y FullCalendar 7

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

El plan (07-frontend.md §7.1) proponía `clientLoader` + TanStack Query en el panel y los plugins
`@fullcalendar/daygrid`, `timegrid`, `list` e `interaction` por separado.

## Decisión

1. **Datos del panel con loaders del servidor** (llaman a `api` con la cookie y el Host del visitante) y
   mutaciones desde el cliente con `fetch`; tras guardar se revalida la ruta. Sin TanStack Query: menos
   JavaScript y una sola fuente de verdad.
2. **Tiempo real por SSE como aviso:** `GET /api/v1/stream` solo dice qué tablero cambió (tipo, tablero,
   evento, si fue uno mismo); el calendario vuelve a pedir sus datos. No viajan datos personales por el flujo.
3. **FullCalendar 7:** los plugins viven dentro de `@fullcalendar/react` (`/daygrid`, `/timegrid`, `/list`,
   `/interaction`, tema `classic`) y usa `temporal-polyfill`; los paquetes sueltos siguen en 6.x. Se carga
   solo en la ruta del calendario, en el cliente y de forma diferida.
4. **Presupuesto de la página de reserva y del embed: ≤ 150 KB** comprimidos (medidos: 129 KB).
5. **Cuenta atrás del apartado** relativa a cuando se aparta (10 min), sin comparar con el reloj del servidor.

## Consecuencias

Navegar entre páginas del panel vuelve a pedir datos al servidor (respuesta en milisegundos dentro de la
misma red). La campana de avisos queda como marcador hasta F8.
