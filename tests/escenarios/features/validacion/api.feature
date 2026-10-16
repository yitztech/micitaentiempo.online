# language: es
@backend @validacion
Característica: Límites de texto en todos los puntos de escritura
  Antecedentes:
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos

  Esquema del escenario: El API impide exceder el límite del campo
    Cuando intenta guardar "<operacion>" con texto de longitud <longitud>
    Entonces la respuesta tiene estado 400
    Y la respuesta contiene "validation_failed"

    Ejemplos:
      | operacion | longitud |
      | perfil    | 121      |
      | negocio   | 121      |
      | tablero   | 121      |
      | servicio  | 121      |
      | titulo    | 201      |
      | notas     | 2001     |
      | asistente | 121      |
      | reserva   | 121      |
      | contacto  | 4001     |

  Esquema del escenario: El API permite el límite exacto
    Cuando intenta guardar "<operacion>" con texto de longitud 120
    Entonces la respuesta tiene estado <estado>

    Ejemplos:
      | operacion | estado |
      | perfil    | 200    |
      | negocio   | 200    |
      | tablero   | 200    |
      | servicio  | 201    |
