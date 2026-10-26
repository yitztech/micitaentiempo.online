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
      | texto de 101  | 422    |
      | vacío         | 422    |
      | espacios      | 422    |
      | control       | 422    |
      | bidi          | 422    |
      | etiquetas     | 422    |
