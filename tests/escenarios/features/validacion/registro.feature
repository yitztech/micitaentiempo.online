# language: es
@backend @validacion
Característica: El registro valida nombres aunque se omita el frontend
  Esquema del escenario: Límites y caracteres del nombre completo
    Cuando intenta registrarse con el nombre de prueba "<nombre>"
    Entonces la respuesta tiene estado <estado>

    Ejemplos:
      | nombre        | estado |
      | internacional | 200    |
      | texto de 100  | 200    |
      | texto de 101  | 400    |
      | vacío         | 400    |
      | espacios      | 400    |
      | control       | 400    |
      | bidi          | 400    |
      | etiquetas     | 400    |
