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

## Desplegar

1. Fusionar en `main` (PR revisado). `deploy.yml` corre las pruebas, publica las 5 imágenes en GHCR con
   las etiquetas `main` y el SHA, llama al webhook de Coolify y espera a que `/version.json` y
   `/api/healthz` sirvan el SHA nuevo (hasta 10 minutos).
2. Coolify reinicia los contenedores (~1 minuto de corte): fusionar fuera de horas pico.
3. Cada servicio aplica sus migraciones al arrancar (expandir/contraer, `08-infraestructura.md` §8.10).
4. Comprobar en producción:
   ```bash
   ES_URL=https://micitaentiempo.online EN_URL=https://myappointmentontime.online EXPECTED_SHA=<sha> \
     pnpm --filter @mcet/escenarios exec playwright test --project escritorio --grep @humo-produccion
   ```
   Son de solo lectura: no crean cuentas ni citas.

## Volver atrás

- **Vía normal:** PR de *revert* del commit problemático, aprobado y fusionado; el despliegue es automático.
- **Vía rápida:** pedir a la plataforma que fije las imágenes al SHA anterior (`:<sha>` en GHCR).
- Las migraciones son compatibles hacia atrás (expandir/contraer), así que la versión anterior funciona con
  el esquema nuevo. Nunca se borra ni se renombra en el mismo despliegue que cambia el código.

## Rotar secretos

Los genera y guarda la plataforma; nunca van al repositorio. Tras cambiar uno, redesplegar los servicios
que lo usan.

| Secreto | Qué protege | Efecto de rotarlo |
|---|---|---|
| `BETTER_AUTH_SECRET` | Sesiones, firmas de Better Auth y cifrado de las claves privadas del JWKS | Cierra todas las sesiones. Después, borrar las filas de `app.jwks` (`docker compose exec postgres psql -U api -d micita -c 'delete from app.jwks'`): se crea una clave nueva y las IA conectadas obtienen tokens nuevos con su refresh token |
| `APP_ENC_KEY` | Secretos de canales (Slack, Telegram), firmas de baja de correos y tokens de apartado | Los canales conectados dejan de funcionar hasta reconectarlos; los enlaces de baja antiguos caducan |
| `CALENDAR_TOKEN_ENC_KEY` | Tokens de Google, Microsoft e iCloud (AES-GCM, clave `k1`) | Las conexiones pasan a «desconectado» y cada propietario debe reconectar (recibe un aviso) |
| `RPC_SECRET_API_TO_CALENDAR` · `RPC_SECRET_CALENDAR_TO_API` | JWT internos entre `api` y `calendar` | Redesplegar ambos a la vez |
| `ALTCHA_HMAC_KEY` | Retos antibots | Solo falla el reto en curso; basta recargar |
| `DB_PASSWORD` | Acceso a PostgreSQL | Cambiar la contraseña del rol `api` (y del de `calendar`) y redesplegar |
| SMTP, Google, Microsoft, Slack, Telegram | Envío de correo y proveedores | Cambiar en la consola del proveedor y en la plataforma a la vez |

## Incidentes

1. **Detectar:** `docker compose logs` de cada servicio (JSON con `request_id`, sin tokens ni consultas),
   `/api/healthz`, alertas de la plataforma.
2. **Contener según el caso:**
   - Cuenta comprometida: borrar sus sesiones (`delete from app.sessions where user_id = '<id>'`) y pedir
     cambio de contraseña.
   - Aplicación de IA abusiva: revocarla (Panel → IA del usuario, o `delete from app.mcp_grants where
     client_id = '<id>'`; con `delete from app.oauth_clients where client_id = '<id>'` desaparece para todos).
   - Organización abusiva: `org-set-plan.js <org_id> <plan> suspended`.
   - Fuga de un secreto: rotarlo (tabla de arriba).
3. **Avisar:** si hay datos personales afectados, a los negocios responsables sin demora indebida y en un
   máximo de 72 horas (anexo de encargo de las condiciones).
4. **Cerrar:** causa, arreglo con su prueba o escenario, y nota en el registro de cambios.

## Activar WhatsApp

1. En Meta Business: número verificado, app de WhatsApp Business y plantillas `mcet_aviso` y `mcet_codigo`
   aprobadas en es y en.
2. Dar a la plataforma `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_APP_SECRET`, y redesplegar.
3. Añadir a Meta como encargado en el aviso de privacidad **antes** de anunciarlo.

## MCP (aplicaciones de IA)

- Los clientes de registro dinámico sin uso se borran solos a las 24 h; los CIMD se revalidan cada hora.
- Límites: 120 llamadas/min por token y 600/min por organización en `api`, más `RATE_MCP` por IP en el
  gateway.
- Verificación manual con los clientes reales antes del lanzamiento: `docs/mcp-verificacion.md`.

## Primer arranque en producción

- Medir la subred de Traefik y fijar `TRUSTED_PROXY_CIDR` (por ejemplo, `docker network inspect` de la red
  de Coolify); hasta entonces, `X-Forwarded-For` no es fiable y los límites por IP agrupan a todos.
- Registrar el webhook de Telegram en el dominio principal y comprobar el cliente OAuth de Google (dos
  orígenes y las URI de retorno de inicio de sesión y calendario).
