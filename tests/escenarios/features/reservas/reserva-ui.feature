# language: es
@reservas @ui
Característica: Reservar desde la página pública, «Mis citas» y el embed
  El cliente final reserva desde el teléfono en su idioma, confirma con un código y gestiona sus citas
  (RF-10, RF-17).

  @critico @movil
  Esquema del escenario: Reserva desde el teléfono en <idioma>
    Dado un propietario "Laura" con plan "personal" en el dominio "<dominio>"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "<dominio>"
    Y elige el primer día y la primera hora libres
    Y escribe sus datos y aparta el horario
    Y escribe el código que le llegó por correo
    Entonces ve «<confirmada>»
    Y "Laura" ve la cita de "Carla" en su tablero

    Ejemplos:
      | idioma  | dominio | confirmada              |
      | español | es      | ¡Cita confirmada!       |
      | inglés  | en      | Appointment confirmed!  |

  Escenario: Confirmar la reserva con «Continuar con Google» (ventana emergente)
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Y elige el primer día y la primera hora libres
    Y escribe sus datos y aparta el horario
    Y continúa con Google
    Entonces ve «¡Cita confirmada!»
    Y "Laura" ve la cita de "Carla" en su tablero

  @critico
  Escenario: «Mis citas» permite cancelar una cita
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Y la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Carla" entra a «Mis citas» con un código
    Entonces ve 1 cita en la lista
    Cuando cancela la cita desde la lista
    Entonces ve «Cita cancelada.»

  @critico
  Escenario: El embed muestra el tablero dentro de otra web
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Cuando una web ajena inserta el tablero con embed.js en modo "inline"
    Entonces el iframe muestra el tablero "Consultas"
    Y la página del embed permite insertarse en cualquier sitio

  Escenario: La página de reserva no tiene barreras de accesibilidad graves
    Dado un propietario "Laura" con plan "personal" en el dominio "en"
    Y "Laura" tiene el tablero "Consults" en "America/New_York" del país "US"
    Y el tablero tiene el servicio "Consultation" de 30 minutos
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "en"
    Entonces axe no encuentra problemas graves ni críticos

  @capturas
  Escenario: Capturas de la reserva y del panel en cuatro anchos
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Entonces se guardan capturas de la reserva y del panel en 360, 768, 1024 y 1440 px

  Escenario: La página de reserva respeta el presupuesto de JavaScript
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Entonces la página carga como mucho 150 KB de JavaScript comprimido
