# language: es
@panel
Característica: Panel del negocio
  El propietario configura su agenda con el asistente y gestiona citas, series y bloqueos desde el
  calendario (RF-05 a RF-12).

  @critico
  Escenario: El asistente deja la agenda lista para compartir
    Dado un usuario "Nora" registrado sin negocio en el dominio "es"
    Cuando "Nora" abre su panel
    Entonces ve el asistente de alta
    Cuando "Nora" completa el asistente con el negocio "Estética Nora" y el tablero "Cabina 1"
    Entonces ve el enlace de reserva del tablero
    Y el tablero "Cabina 1" tiene horario, feriados de "MX" y un servicio

  @critico
  Escenario: Una serie semanal creada desde el calendario
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando "Laura" abre el calendario del tablero
    Y crea una cita del "2026-09-15" a las "10:00" que se repite cada semana 4 veces
    Entonces el tablero tiene 4 citas de la serie

  Escenario: Un bloqueo creado desde el calendario
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando "Laura" abre el calendario del tablero
    Y bloquea desde el calendario el "2026-09-16" de "09:00" a "12:00"
    Entonces el tablero tiene un bloqueo el "2026-09-16"

  Escenario: El panel no tiene barreras de accesibilidad graves
    Dado un propietario "Laura" con plan "personal" en el dominio "en"
    Y "Laura" tiene el tablero "Consults" en "America/New_York" del país "US"
    Cuando "Laura" abre el calendario del tablero
    Entonces axe no encuentra problemas graves ni críticos
