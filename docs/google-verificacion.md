# Verificación de la app con Google

Los permisos de Calendar que usa Mi Cita en Tiempo exigen verificar la app con Google antes de abrirla al
público. Este guion sirve para preparar la solicitud y grabar el vídeo que pide Google.

## Datos de la solicitud

- **Nombre:** Mi Cita en Tiempo (y My Appointment On Time como nombre en inglés del mismo producto).
- **Dominios autorizados:** `micitaentiempo.online` y `myappointmentontime.online`.
- **Páginas:** inicio, aviso de privacidad (`/privacidad`, `/privacy`) y condiciones (`/condiciones`, `/terms`).
- **URI de retorno:**
  - `https://micitaentiempo.online/api/auth/callback/google` y `https://myappointmentontime.online/api/auth/callback/google` (entrar con Google).
  - `https://micitaentiempo.online/api/integrations/google/callback` y `https://myappointmentontime.online/api/integrations/google/callback` (conectar el calendario).
- **Permisos y para qué se usan:**

| Permiso | Uso |
|---|---|
| `openid`, `email` | Identificar la cuenta conectada |
| `calendar.calendarlist.readonly` | Listar los calendarios para que el negocio elija cuáles bloquean su agenda |
| `calendar.freebusy` | Leer solo ocupado/libre de esos calendarios (nunca títulos ni detalles) |
| `calendar.app.created` | Crear el calendario «Mi Cita en Tiempo — <tablero>» y escribir allí las citas del negocio |

## Guion del vídeo (unos 3 minutos)

1. Mostrar la barra de direcciones con `https://micitaentiempo.online` y el idioma.
2. Entrar como propietario y abrir **Panel → tablero → Ajustes → Calendarios conectados**.
3. Pulsar **Conectar Google Calendar**: se ve la pantalla de consentimiento con el **ID de cliente** y los
   permisos de la tabla.
4. Aceptar y volver al panel: el estado dice «Conectado» y se listan los calendarios.
5. Explicar «Bloquea mi agenda»: en Google Calendar crear un evento a las 10:00 y mostrar que la página de
   reserva ya no ofrece esa hora (solo se leyó ocupado/libre).
6. Hacer una reserva desde la página pública y mostrar que aparece en el calendario «Mi Cita en Tiempo —
   <tablero>» de Google (lo único que la app escribe).
7. Mostrar **Desconectar** y que la app deja de acceder; mencionar la revocación en
   `myaccount.google.com/permissions`.

## Antes de enviar

- Aviso de privacidad publicado con la sección de datos de Google (uso limitado: los datos de Google solo se
  usan para la función de calendario y no se transfieren ni se usan para publicidad).
- Logo y nombre iguales en la pantalla de consentimiento y en el sitio.
