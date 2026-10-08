# language: es
@qa-diseno
Característica: Evidencia de diseño y accesibilidad del cliente
  La interfaz conserva sus acciones en pantallas estrechas, con texto largo y en modo oscuro.
  El panel y la reserva embebida se prueban con sesiones reales del entorno aislado.

  Esquema del escenario: Reflujo y contraste de la página "<ruta>" en "<dominio>"
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces se verifica el reflujo en cuatro anchos y dos esquemas de color

    Ejemplos:
      | dominio | ruta                  |
      | es      | /                     |
      | en      | /                     |
      | es      | /contacto             |
      | en      | /contact              |
      | es      | /preguntas-frecuentes |
      | en      | /faq                  |
      | es      | /privacidad           |
      | en      | /terms                |
      | es      | /entrar               |
      | en      | /sign-in              |
      | es      | /citas                |
      | en      | /appointments         |

  Esquema del escenario: Panel autenticado con nombre largo en "<dominio>"
    Dado un propietario "Laura" con plan "personal" en el dominio "<dominio>"
    Y "Laura" tiene el tablero "Consultas de seguimiento y acompañamiento para personas con necesidades de atención personalizada" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Cuando "Laura" abre el calendario del tablero
    Entonces se verifica el reflujo en cuatro anchos y dos esquemas de color
    Y el diálogo de nueva cita conserva el foco al abrir y cerrar con teclado

    Ejemplos:
      | dominio |
      | es      |
      | en      |

  @movil
  Escenario: Reserva completa y sesión dentro de un iframe de otro origen
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando una web ajena inserta el tablero con embed.js en modo "inline"
    Entonces el iframe muestra el tablero "Consultas"
    Cuando completa una reserva por código dentro del iframe
    Entonces la reserva embebida conserva la sesión, ajusta su altura y avisa al anfitrión

  @movil
  Escenario: Foco, etiquetas y anuncios de la reserva al avanzar con teclado
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y la fecha actual es "2026-09-14T12:00:00Z"
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Entonces el horario se elige con teclado y el foco avanza a los datos
    Cuando escribe sus datos y aparta el horario
    Entonces el foco y los anuncios de verificación son accesibles
