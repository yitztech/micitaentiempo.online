# 11. DayOtter: qué aprovechar

[DayOtter](https://github.com/Dayotter/dayotter) (v0.5.0, AGPLv3, código público desde mediados de 2026)
sigue descartado como motor, por los motivos del estudio técnico: no da de alta negocios por API, no tiene
citas recurrentes y pide 1–2 GB de RAM con Redis. Pero resuelve bien problemas que también tenemos. Se
adoptan **ideas y patrones, no código**: copiar código AGPLv3 obligaría a publicar el nuestro bajo la misma
licencia.

Fuentes revisadas: [README](https://github.com/Dayotter/dayotter),
[FEATURES.md](https://github.com/Dayotter/dayotter/blob/main/docs/FEATURES.md),
[ARCHITECTURE.md](https://github.com/Dayotter/dayotter/blob/main/docs/ARCHITECTURE.md),
[PROGRESS.md](https://github.com/Dayotter/dayotter/blob/main/docs/PROGRESS.md) y
[EDITIONS.md](https://github.com/Dayotter/dayotter/blob/main/docs/EDITIONS.md).

## 11.1 Se adopta en la primera versión

| Característica de DayOtter | Cómo la aplicamos | Fase |
|---|---|---|
| Motor de disponibilidad como **función pura** (horario + ocupado + restricciones → huecos), probado con cambios de horario | `availability.Compute` en Go, con escenarios YAML y pruebas de propiedades | F4 |
| **Caché de ocupado** (`busy_blocks`): el motor solo lee la caché; la sincronización la llena | `calendar.external_busy`, con revalidación en vivo antes de confirmar | F4, F10 |
| **Holds** (apartar un hueco y confirmarlo) en su API v1 | Hold de 10 min mientras el cliente final verifica su correo | F5 |
| Reglas de disponibilidad: márgenes, antelación mínima, ventana, intervalo, límites diarios, excepciones por fecha | Campos de `services` y `date_overrides` | F4 |
| **Recordatorios** a 1 día y 1 hora, idempotentes y en la zona del destinatario | Trabajos de pg-boss con revalidación de la cita | F8 |
| **Canales resueltos al enviar** según las preferencias de cada usuario (correo, Slack, WhatsApp…) | Difusión → preferencias → canal | F8 |
| IA que **propone y el humano confirma** («confirm-first») | Anotaciones MCP de solo lectura y destructivas, y previsualizar + confirmar en acciones masivas | F11 |
| **Revisión de respaldo cada 15 min** de la sincronización + renovación automática de suscripciones | `reconcile_connection` | F10 |
| Modo **solo libre/ocupado** (no leer detalles de eventos externos) | Por defecto: de calendarios externos solo se guardan intervalos | F10 |
| **Embed** en línea, ventana emergente y botón flotante + «Añadir al calendario» | `embed.js` con tres modos; botones de Google, Outlook y `.ics` | F7, F10 |
| **Efectos secundarios que nunca rompen la reserva** | Outbox con River: avisos y sincronización fuera de la transacción de la reserva | F2, F5 |
| **Estado de salud de cada conexión** y flujo de reconexión | Estado, último error y botón «Reconectar» | F10 |
| Estado `state` de OAuth **firmado contra CSRF** y defensas SSRF en llamadas salientes | OAuth de calendarios en `api`; descarga de documentos CIMD con protección SSRF | F10, F11 |
| Tipos fuertes como contrato y una sola puerta de calidad | `buf` + Zod compartido + CI que bloquea | F0, F2 |
| Precio de referencia: Pro a US$9 por puesto y mes | Nuestro Personal a US$5 y Sucursales a US$20 por organización son competitivos | — |

## 11.2 Para después del lanzamiento

| Característica | Valor para Mi Cita en Tiempo |
|---|---|
| Aviso «voy tarde» (*running late*): un toque avisa a la siguiente cita | Muy útil en consultorios y salones |
| Horarios recomendados y superponer el calendario del cliente en el selector | Mejora la conversión de reservas |
| Analítica de reservas, «a dónde se va tu tiempo» y exportación CSV | Lo más pedido tras la agenda; MCP ya expone estadísticas desde F11 |
| Reparto entre profesionales (*round-robin*) y disponibilidad colectiva | Para sucursales con varios profesionales |
| API pública con claves y webhooks salientes firmados | Integraciones de terceros |
| Pagos por cita, depósitos y paquetes prepagados | Depende de la pregunta abierta sobre Stripe Connect |

## 11.3 No se adopta

- Redis + BullMQ: las colas viven en PostgreSQL (estudio técnico y RNF-11).
- Monolito Next.js: la arquitectura pedida separa Go, NestJS y React.
- Funciones de IA fuera de la agenda (voz, SMS entrantes, memoria a largo plazo): fuera de alcance.
- Funciones de su nube (`ee/`, licencia comercial): ni las necesitamos ni podríamos usarlas.
