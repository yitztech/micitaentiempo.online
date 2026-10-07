# language: es
@reservas
Característica: Reservas, holds, bloqueos y series
  Un cliente final reserva sin ver a otros clientes; el negocio gestiona citas, bloqueos y series
  (RF-10, RF-11, RF-12). Nunca hay dos citas en el mismo asiento a la vez.

  Antecedentes:
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"

  @critico
  Escenario: Un cliente final reserva con un código enviado a su correo
    Cuando la visitante "Carla" aparta el "2026-09-15" a las "10:00"
    Entonces el horario queda apartado
    Y el "2026-09-15" a las "10:00" no aparece libre
    Cuando "Carla" pide un código a su correo y lo escribe
    Y "Carla" confirma su reserva
    Entonces la reserva de "Carla" queda confirmada
    Y "Laura" ve la cita de "Carla" en su tablero
    Y "Carla" ve 1 cita en «Mis citas»

  @critico
  Escenario: Un cliente final no ve las citas de otros ni crea series
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Y la clienta "Diana" tiene una cita el "2026-09-15" a las "11:00"
    Entonces "Diana" ve 1 cita en «Mis citas»
    Cuando "Diana" intenta cancelar la cita de "Carla"
    Entonces la respuesta tiene estado 404
    Cuando "Diana" intenta crear una serie semanal en el tablero
    Entonces la respuesta tiene estado 404

  Escenario: Dos visitantes no pueden apartar el mismo horario
    Cuando la visitante "Carla" aparta el "2026-09-15" a las "10:00"
    Y la visitante "Diana" intenta apartar el "2026-09-15" a las "10:00"
    Entonces la respuesta tiene estado 409
    Y la respuesta contiene "slot_taken"

  Escenario: El cliente final cancela su cita y el horario se libera
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Carla" cancela su cita
    Entonces "Carla" ve 0 citas en «Mis citas»
    Y el "2026-09-15" a las "10:00" aparece libre

  @critico
  Escenario: Serie semanal cambiada desde una fecha en adelante
    Cuando "Laura" crea la serie "FREQ=WEEKLY;BYDAY=TU;COUNT=6" desde el "2026-09-15" a las "10:00"
    Entonces la serie tiene 6 fechas
    Cuando "Laura" mueve la fecha 3 y las siguientes a las "12:00"
    Entonces hay 2 fechas a las "10:00" y 4 a las "12:00"

  @critico
  Escenario: Un bloqueo cancela las citas que pisa
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Laura" bloquea el "2026-09-15" de "09:00" a "12:00" cancelando las citas
    Entonces la cita de "Carla" queda cancelada
    Y no hay horarios libres el "2026-09-15" entre "09:00" y "12:00"

  @critico @reloj
  Escenario: Un horario apartado sin confirmar caduca a los 10 minutos
    Cuando la visitante "Carla" aparta el "2026-09-15" a las "10:00"
    Y pasan 11 minutos
    Entonces el "2026-09-15" a las "10:00" aparece libre
    Cuando la visitante "Diana" aparta el "2026-09-15" a las "10:00"
    Entonces el horario queda apartado
