# language: es
@tableros
Característica: Tableros, horarios, feriados y servicios
  Un negocio crea su tablero con horario laboral, descansos y feriados de su país (RF-04, RF-05, RF-06).

  @critico
  Escenario: El plan Personal permite un solo tablero
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Cuando "Laura" crea el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Entonces la respuesta tiene estado 201
    Y el tablero tiene un enlace público "consultas"
    Cuando "Laura" crea el tablero "Segunda sucursal" en "America/Mexico_City" del país "MX"
    Entonces la respuesta tiene estado 409
    Y la respuesta contiene "plan_limit"

  Escenario: El plan Sucursales permite 10 tableros y no 11
    Dado un propietario "Marco" con plan "branches" en el dominio "es"
    Cuando "Marco" crea 10 tableros
    Entonces todos se crearon
    Cuando "Marco" crea el tablero "Undécima" en "America/Mexico_City" del país "MX"
    Entonces la respuesta tiene estado 409

  @critico
  Escenario: Horario con comida y feriados de México en la disponibilidad
    Dado un propietario "Sofía" con plan "personal" en el dominio "es"
    Y "Sofía" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero bloquea los feriados públicos de "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando "Sofía" consulta los horarios del "2026-09-14" al "2026-09-16"
    Entonces hay 16 horarios el "2026-09-14"
    Y hay 16 horarios el "2026-09-15"
    Y no hay horarios el "2026-09-16"
    Y el día "2026-09-16" figura como "Día de la Independencia"

  @critico
  Escenario: Un observador ve el tablero pero no cambia la configuración
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Cuando "Ana" invita a "Olga" como "observer"
    Entonces "Olga" recibe la invitación en español
    Cuando "Olga" se registra con el correo invitado y acepta la invitación
    Entonces la respuesta tiene estado 200
    Y "Olga" ve el tablero con el rol "observer"
    Cuando "Olga" intenta cambiar el horario del tablero
    Entonces la respuesta tiene estado 403

  Escenario: Un editor debe aceptar con su cuenta de Google
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Cuando "Ana" invita a "Edu" como "editor"
    Y "Edu" se registra con el correo invitado y acepta la invitación
    Entonces la respuesta tiene estado 403
    Y la respuesta contiene "google_required"

  @critico
  Escenario: Otra organización no ve el tablero
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y un propietario "Intrusa" con plan "personal" en el dominio "es"
    Cuando "Intrusa" consulta el tablero de "Ana"
    Entonces la respuesta tiene estado 404
