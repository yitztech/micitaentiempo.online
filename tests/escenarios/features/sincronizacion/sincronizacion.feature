# language: es
@sincronizacion
Característica: Sincronización con Google, Outlook y Apple
  Nuestro sistema es la fuente de verdad: el ocupado externo bloquea la agenda, nuestras citas aparecen en
  el calendario conectado y lo que se cambie allí se restaura (RF-15).

  Antecedentes:
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"

  @critico
  Escenario: Los enlaces ICS muestran el tablero con detalles o solo «Ocupado» y se pueden revocar
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Laura" crea un enlace ICS "full"
    Entonces el enlace ICS incluye "Carla"
    Cuando "Laura" crea un enlace ICS "busy"
    Entonces el enlace ICS incluye "SUMMARY:Ocupado"
    Y el enlace ICS no incluye "Carla"
    Cuando "Laura" revoca el enlace ICS
    Entonces el enlace ICS ya no responde

  @critico
  Escenario: Google: el ocupado externo bloquea, la reserva aparece y un cambio externo se restaura
    Cuando "Laura" conecta "google" al tablero
    Y el calendario conectado tiene ocupado el "2026-09-15" de "10:00" a "11:00"
    Entonces los horarios del "2026-09-15" no incluyen las "10:00" ni las "10:30"
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "12:00"
    Entonces la cita de "Carla" aparece en el calendario conectado
    Cuando alguien mueve la cita en el calendario conectado al "2026-09-15" a las "16:00"
    Entonces la cita vuelve al "2026-09-15" a las "12:00" en el calendario conectado
    Cuando el proveedor revoca el acceso
    Entonces la conexión queda desconectada
    Y "Laura" tiene un aviso de calendario desconectado

  Escenario: Outlook: la reserva aparece en el calendario de la app
    Cuando "Laura" conecta "microsoft" al tablero
    Y la clienta "Carla" tiene una cita el "2026-09-15" a las "12:00"
    Entonces la cita de "Carla" aparece en el calendario conectado

  @critico
  Escenario: iCloud por CalDAV: el ocupado bloquea y la reserva se escribe en el calendario
    Dado un calendario de iCloud con un evento el "2026-09-15" de "10:00" a "11:00"
    Cuando "Laura" conecta iCloud con una contraseña de app
    Entonces los horarios del "2026-09-15" no incluyen las "10:00" ni las "10:30"
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "12:00"
    Entonces la cita de "Carla" aparece en el calendario de iCloud
