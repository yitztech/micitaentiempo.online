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

  Escenario: Un propietario cierra su negocio y después borra la cuenta
    Dado un propietario "Olga" con plan "personal" en el dominio "es"
    Y "Olga" tiene el tablero "Estudio" en "America/Mexico_City" del país "MX"
    Cuando "Olga" abre su cuenta
    Y borra su cuenta escribiendo "BORRAR"
    Entonces ve «Primero cierra tu negocio (en esta misma página) y después borra la cuenta.»
    Cuando cierra su negocio escribiendo su nombre
    Entonces ve «Negocio cerrado. Ya puedes borrar tu cuenta si quieres.»
    Y la página pública del tablero ya no existe
    Cuando borra su cuenta escribiendo "BORRAR"
    Entonces la sesión de "Olga" ya no es válida

  Escenario: Verificación en dos pasos con app de autenticación
    Dado un usuario "Irene" registrado sin negocio en el dominio "es"
    Cuando "Irene" abre su cuenta
    Y activa la verificación en dos pasos
    Entonces ve «Verificación en dos pasos activada.»
    Y ve sus códigos de respaldo
    Cuando "Irene" entra en el navegador con su contraseña
    Entonces se le pide el código de dos pasos
    Cuando escribe el código de su app de autenticación
    Entonces está en su panel
    Cuando "Irene" entra en el navegador con su contraseña
    Y usa un código de respaldo
    Entonces está en su panel
