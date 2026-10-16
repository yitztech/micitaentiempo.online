# language: es
Característica: Aplicaciones móviles (Android e iOS) en teléfonos y tablets con login de Google
  Las aplicaciones móviles para Android e iOS reutilizan las interfaces del frontend con Expo,
  se conectan al backend mediante sesiones Bearer, permiten iniciar sesión con Google igual que
  en la web y adaptan su interfaz tanto en teléfonos como en tablets.

  @backend @movil
  Esquema del escenario: Arranque móvil y configuración de Google en el dominio "<dominio>"
    Cuando la app móvil consulta "/api/public/v1/mobile/bootstrap" en el dominio "<dominio>"
    Entonces la respuesta móvil tiene estado 200 e idioma "<dominio>"
    Y la configuración móvil incluye login con Google y los esquemas nativos

    Ejemplos:
      | dominio |
      | es      |
      | en      |

  @backend @movil
  Escenario: Registro, verificación, acceso, resumen del panel y cierre de sesión desde la API móvil
    Dado una persona nueva con correo único "movil-alta" en el dominio "es"
    Cuando se registra desde la app móvil como "Elena Móvil" con la contraseña "una-clave-bien-larga-2026"
    Entonces recibe un correo con asunto "Confirma tu correo" desde "no-reply@micitaentiempo.localhost"
    Cuando abre el enlace de verificación del correo
    Y entra desde la app móvil con la contraseña "una-clave-bien-larga-2026"
    Entonces recibe un token Bearer móvil válido
    Cuando crea desde la app móvil la organización "Estudio Elena" y consulta el resumen del panel
    Entonces el resumen móvil incluye la organización "Estudio Elena"
    Cuando cierra la sesión desde la app móvil
    Entonces el token móvil ya no permite consultar el resumen del panel

  @backend @movil
  Escenario: Login con Google en la app móvil con código OAuth PKCE y con idToken para panel y reservas
    Cuando la app móvil inicia sesión con Google usando el código de prueba "propietaria-google@escenarios.test"
    Entonces recibe un token Bearer móvil válido para "propietaria-google@escenarios.test"
    Y el token móvil permite consultar "/api/v1/me" y "/api/public/v1/my/bookings"
    Cuando la app móvil inicia sesión con Google usando un idToken para "clienta-idtoken@escenarios.test"
    Entonces recibe un token Bearer móvil válido para "clienta-idtoken@escenarios.test"

  @backend @movil @validacion
  Esquema del escenario: Los endpoints móviles rechazan nombres inválidos (<caso>)
    Dado una persona nueva con correo único "movil-val" en el dominio "es"
    Cuando intenta registrarse desde la app móvil con el nombre "<caso>" y la contraseña "una-clave-bien-larga-2026"
    Entonces la respuesta tiene estado 400

    Ejemplos:
      | caso         |
      | vacío        |
      | espacios     |
      | control      |
      | bidi         |
      | etiquetas    |
      | texto de 121 |

  @frontend @movil @tablet
  Esquema del escenario: Reserva con Google y cancelación en «Mis citas» desde <dispositivo> (<ancho>x<alto>)
    Dado un propietario "Laura" con plan "personal" en el dominio "<dominio>"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando la visitante "Carla" usa un dispositivo <ancho>x<alto> y abre la reserva del tablero en "<dominio>"
    Y elige el primer día y la primera hora libres
    Y escribe sus datos y aparta el horario
    Y continúa con Google
    Entonces ve «<confirmada>»
    Y la pantalla móvil o tablet no presenta desbordamiento horizontal
    Cuando abre «Mis citas» en el mismo dispositivo del dominio "<dominio>" y cancela su cita
    Entonces ve «<cancelada>»

    Ejemplos:
      | dispositivo    | dominio | ancho | alto | confirmada             | cancelada                |
      | teléfono iOS   | es      | 390   | 844  | ¡Cita confirmada!      | Cita cancelada.          |
      | tablet iPad    | es      | 834   | 1194 | ¡Cita confirmada!      | Cita cancelada.          |
      | tablet Android | en      | 800   | 1280 | Appointment confirmed! | Appointment canceled.    |

  @frontend @movil @tablet
  Esquema del escenario: Acceso con Google en «Mis citas» desde tablet (<ancho>x<alto>) en "<dominio>"
    Dado un propietario "Laura" con plan "personal" en el dominio "<dominio>"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Y la clienta "Carla" tiene una cita el "2026-09-15" a las "10:00"
    Cuando "Carla" abre «Mis citas» en una tablet <ancho>x<alto> del dominio "<dominio>" e inicia sesión con Google
    Entonces ve 1 cita en la lista de la tablet y sin desbordamiento horizontal

    Ejemplos:
      | dominio | ancho | alto |
      | es      | 834   | 1194 |
      | en      | 800   | 1280 |
