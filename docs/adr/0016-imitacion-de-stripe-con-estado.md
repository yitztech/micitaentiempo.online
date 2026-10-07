# 0016. Imitación de Stripe con estado para los escenarios de facturación

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

El plan proponía `stripe-mock` para los escenarios de facturación. `stripe-mock` no guarda estado: cada
suscripción devuelve un ejemplo fijo, así que no permite probar transiciones (pago fallido → pendiente →
solo lectura) ni eventos fuera de orden contra la misma suscripción.

## Decisión

- El servidor de captura de pruebas (`tests/fakes/captura.mjs`) imita las llamadas de Stripe que usa `api`
  (clientes, precios por `lookup_key`, Checkout Sessions, suscripciones, SetupIntents y facturas) y guarda
  su estado; los escenarios fijan el estado de cada suscripción y envían webhooks firmados con un secreto de
  prueba sin valor real.
- En CI la facturación sigue **apagada como en producción**; los escenarios `@stripe` la encienden contra la
  imitación con `/api/__test/billing` (solo TEST_MODE) y corren en serie (`@reloj`) porque el interruptor es
  global.
- `api` no arranca con una configuración de Stripe a medias.

## Consecuencias

Los escenarios cubren contratar, reenvío de webhooks, pago fallido, fin de prueba, eventos fuera de orden y
bajada de plan sin claves reales. Antes de cobrar de verdad se prueba el flujo en el modo de prueba de
Stripe (`docs/operacion.md`).
