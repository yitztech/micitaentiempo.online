# Operación

Procedimientos manuales de Mi Cita en Tiempo. Las copias de seguridad y la seguridad perimetral son de la
plataforma; aquí solo lo propio de la aplicación.

## Facturación sin Stripe (situación actual)

Decisión del 2026-10-06: solo suscripción y Stripe **sin configurar**. Mientras no existan las tres claves:

- Precios y planes se ven; «Contratar» dice «Disponible pronto».
- Al crear el negocio se elige plan y se aplican sus límites (1 o 10 tableros).
- La prueba gratuita **no vence** y la interfaz no muestra cuenta atrás.
- No se carga ningún script de Stripe ni se amplía la CSP.

Para cambiar plan o estado a mano:

```bash
docker compose exec api node dist/scripts/org-set-plan.js <org_id> personal|branches [trialing|active|read_only|suspended]
```

## Activar Stripe

1. Crear la cuenta de Stripe del negocio y completar su verificación.
2. En **modo de prueba**, crear productos y precios (idempotente; usa `lookup_key`):
   ```bash
   STRIPE_SECRET_KEY=sk_test_… pnpm --filter @mcet/api build && STRIPE_SECRET_KEY=sk_test_… pnpm --filter @mcet/api stripe:setup
   ```
3. Registrar el webhook `https://micitaentiempo.online/api/webhooks/stripe` con los eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.paid` e `invoice.payment_failed`. Un solo endpoint sirve a los dos dominios.
4. Probar el flujo completo en modo de prueba (contratar, pago fallido con la tarjeta `4000 0000 0000 0341`,
   cancelar y reanudar).
5. Repetir los pasos 2 y 3 en **modo real**.
6. Decidir impuestos: `STRIPE_TAX_ENABLED=true` solo con Stripe Tax configurado.
7. Entregar a la plataforma, por canal seguro, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y
   `STRIPE_PUBLISHABLE_KEY` (las tres juntas: con una sola, `api` no arranca para no cobrar sin webhooks).
8. Redesplegar y ejecutar una vez:
   ```bash
   docker compose exec api node dist/scripts/billing-activate.js 30
   ```
   Fija el fin de prueba de las organizaciones en prueba (30 días desde hoy) y les avisa por correo.

Nunca se suben claves al repositorio (es público).

## WhatsApp, Slack y Telegram

Implementados y apagados mientras falten sus variables (`WHATSAPP_*`, `SLACK_CLIENT_*`, `TELEGRAM_*`).
WhatsApp necesita además las plantillas aprobadas `mcet_aviso` y `mcet_codigo` en es y en.
