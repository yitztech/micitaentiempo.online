# language: es
@frontend @validacion
Característica: Formularios validados en escritorio, Android e iOS
  Esquema del escenario: Corregir un nombre inválido en ambos idiomas
    Dado el formulario de registro en "<idioma>"
    Cuando escribe el nombre inválido y lo corrige
    Entonces el nombre es válido para enviar

    Ejemplos:
      | idioma |
      | es     |
      | en     |

  Esquema del escenario: Completar un registro válido desde la interfaz
    Dado el formulario de registro en "<idioma>"
    Cuando completa un registro válido desde el navegador
    Entonces ve la confirmación de envío al correo registrado

    Ejemplos:
      | idioma |
      | es     |
      | en     |
