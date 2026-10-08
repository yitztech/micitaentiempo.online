# language: es
@reservas @ui
Característica: Flujos alternativos y catálogo multiservicio en reserva y «Mis citas»
  El cliente final puede elegir entre múltiples servicios, recuperarse de errores de verificación,
  reprogramar citas previas o desistir de cambios manteniendo su cita original.

  Antecedentes:
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"

  # ── HAPPY PATHS ──

  @critico @movil
  Escenario: Selección de servicio cuando el tablero ofrece múltiples servicios
    Dado el tablero tiene el servicio "Limpieza dental" de 60 minutos
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Y elige el servicio "Limpieza dental"
    Entonces ve en el encabezado el servicio "Limpieza dental" de 60 minutos
    Cuando elige el primer día y la primera hora libres
    Y escribe sus datos y aparta el horario
    Y escribe el código que le llegó por correo
    Entonces ve «¡Cita confirmada!»
    Y "Laura" ve la cita de "Carla" en su tablero

  @critico
  Escenario: Reprogramación exitosa desde «Mis citas» con panel comparativo
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Carla" entra a «Mis citas» con un código
    Entonces ve 1 cita en la lista
    Cuando solicita cambiar la hora de su cita
    Y elige una nueva fecha y hora para reprogramar
    Entonces ve el panel de revisión con el horario actual y el nuevo propuesto
    Cuando confirma el nuevo horario
    Entonces ve «Cambiamos tu cita.»

  # ── PATHS ALTERNATIVOS CLÁSICOS ──

  Escenario: Código de verificación erróneo con reintento exitoso
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Y elige el primer día y la primera hora libres
    Y escribe sus datos y aparta el horario
    Y escribe un código incorrecto "000000"
    Entonces ve «El código no es correcto.»
    Cuando escribe el código que le llegó por correo
    Entonces ve «¡Cita confirmada!»

  Escenario: Descarte de reprogramación manteniendo el horario actual
    Dado la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Carla" entra a «Mis citas» con un código
    Entonces ve 1 cita en la lista
    Cuando solicita cambiar la hora de su cita
    Y elige una nueva fecha y hora para reprogramar
    Entonces ve el panel de revisión con el horario actual y el nuevo propuesto
    Cuando decide mantener el horario actual
    Entonces el panel de revisión ya no está visible
    Y ve 1 cita en la lista

  Escenario: Error de conexión al cargar horarios y recuperación con reintento
    Cuando falla la conexión al consultar los horarios
    Y la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Entonces ve «No pudimos cargar los horarios. Revisa tu conexión e inténtalo otra vez.»
    Cuando se restaura la conexión
    Y presiona el botón para reintentar la carga de horarios
    Entonces ve los días disponibles en el calendario

  Escenario: Consulta de «Mis citas» con un correo sin citas previas
    Dado un visitante nuevo "David" sin citas en el dominio "es"
    Cuando "David" entra a «Mis citas» con un código
    Entonces ve que no tiene citas próximas
