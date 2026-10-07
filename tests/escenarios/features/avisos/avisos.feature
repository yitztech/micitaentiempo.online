# language: es
@avisos
Característica: Avisos multicanal y recordatorios
  Cada persona recibe los avisos en su idioma y por los canales que eligió; nunca el autor del cambio
  (RF-13, RF-14, RF-22).

  Antecedentes:
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"

  @critico
  Escenario: Una reserva avisa al propietario y al observador, cada uno en su idioma
    Dado "Olga" es observadora del tablero con su cuenta en inglés
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Entonces "Laura" recibe un correo con el asunto "Aviso de «Consultas»"
    Y "Olga" recibe un correo con el asunto "Update from “Consultas”"
    Y "Carla" recibe la confirmación con el archivo .ics
    Y "Laura" tiene en su panel el aviso "Carla reservó"

  @critico
  Escenario: Quien hace el cambio no recibe aviso y una serie avisa una sola vez
    Dado "Olga" es observadora del tablero con su cuenta en inglés
    Cuando "Laura" crea la serie "FREQ=WEEKLY;BYDAY=TU;COUNT=6" desde el "2026-09-15" a las "10:00"
    Entonces "Olga" recibe exactamente 1 correo con el asunto "Update from “Consultas”"
    Y "Laura" no recibe correos de avisos

  @critico
  Escenario: Vincular Telegram y recibir allí las reservas
    Cuando "Laura" vincula Telegram con el chat 7001001
    Entonces el bot confirma la vinculación en el chat 7001001
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Entonces el chat 7001001 recibe un aviso que contiene "Carla reservó"

  Escenario: WhatsApp verificado y desactivable, probado contra el servidor de captura
    Cuando "Laura" verifica su WhatsApp "+5215512340001"
    Y la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Entonces WhatsApp recibe la plantilla "mcet_aviso" para "5215512340001"

  Escenario: Conectar Slack con «Añadir a Slack»
    Cuando "Laura" conecta Slack
    Y la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Entonces Slack recibe un aviso que contiene "Carla reservó"

  Escenario: Darse de baja con un clic deja de enviar ese grupo por correo
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Entonces "Laura" recibe un correo con el asunto "Aviso de «Consultas»"
    Cuando "Laura" se da de baja desde el enlace del correo
    Y la clienta "Diana" tiene una cita el "2026-09-15" a las "11:00"
    Entonces "Laura" recibe exactamente 1 correo con el asunto "Aviso de «Consultas»"

  @critico @reloj
  Escenario: Recordatorio 24 horas antes, solo si la cita sigue en pie
    Cuando la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Y la clienta "Diana" tiene una cita el "2026-09-15" a las "11:00"
    Y "Diana" cancela su cita
    Y la fecha actual es "2026-09-14T16:31:00Z"
    Y se procesan los avisos
    Entonces "Carla" recibe un correo con el asunto "Recordatorio de tu cita"
    Y "Diana" no recibe un correo con el asunto "Recordatorio de tu cita"
