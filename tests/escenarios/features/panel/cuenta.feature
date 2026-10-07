# language: es
@panel @cuenta
Característica: Panel → Cuenta
  Cada persona gestiona su perfil y su contraseña, y puede exportar o borrar sus datos (RNF-06).

  Escenario: Cambiar el nombre, exportar los datos y borrar la cuenta
    Dado un usuario "Nora" registrado sin negocio en el dominio "es"
    Cuando "Nora" abre su cuenta
    Y cambia su nombre a "Nora Ruiz"
    Entonces ve «Cambios guardados.»
    Cuando exporta sus datos
    Entonces el archivo descargado incluye "Nora Ruiz"
    Cuando borra su cuenta escribiendo "BORRAR"
    Entonces la sesión de "Nora" ya no es válida

  Escenario: Un propietario con negocio no puede borrar la cuenta sin cerrarlo
    Dado un propietario "Olga" con plan "personal" en el dominio "es"
    Cuando "Olga" abre su cuenta
    Y borra su cuenta escribiendo "BORRAR"
    Entonces ve «Eres propietario de un negocio: para cerrarlo y borrar la cuenta, escríbenos desde la página de contacto.»
