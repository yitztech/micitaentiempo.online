# 0015. Cola de avisos propia sobre PostgreSQL en lugar de pg-boss

- Estado: aceptada
- Fecha: 2026-10-07

## Contexto

El plan (05-negocio-api.md §5.6) proponía pg-boss para difundir avisos, entregarlos por canal y programar
recordatorios. Los escenarios necesitan controlar el reloj (recordatorios a 24 h y 1 h) y pg-boss programa
con la hora de la base de datos.

## Decisión

1. **Cola propia** en `app.notification_deliveries`: una fila por destinatario y canal con
   `dedupe_key = event_id + usuario + canal`, reclamada con `FOR UPDATE SKIP LOCKED`, 5 intentos con espera
   exponencial y registro del último error. Si un canal falla de forma definitiva se desactiva y se avisa en
   el panel.
2. **Recordatorios** en `app.reminders` (24 h y 1 h antes), revalidados contra el motor al dispararse.
3. **Reloj de `api`** (`AppClock`) fijable en TEST_MODE junto con el del motor (`/api/__test/clock`) y
   `/api/__test/tick` para ejecutar el worker al instante.
4. **Ingesta reintentable:** el evento se guarda, se procesa y al final se marca `processed_at`; si algo
   falla, el motor reintenta y todo efecto es idempotente (avisos del panel con id `event_id:usuario`).
5. **Canales probados contra un servidor de captura** (`tests/fakes/captura.mjs`) con valores falsos:
   Telegram, Slack y WhatsApp nunca reciben tráfico real en CI. WhatsApp queda desactivado en producción
   hasta definir las variables `WHATSAPP_*`.

## Consecuencias

Una dependencia menos y pruebas deterministas. El worker vive dentro de `api` (un proceso); si se escala a
varias réplicas, `SKIP LOCKED` ya evita entregas duplicadas.
