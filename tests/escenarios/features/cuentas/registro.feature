# language: es
@cuentas
Característica: Registro de negocios con correo verificado
  Un negocio se registra con su nombre completo, su correo (que es su usuario) y una contraseña;
  el correo debe ser válido y verificarse antes de usar el panel (RF-01, RF-02).

  @critico @humo
  Escenario: Registrarse en español exige verificar el correo
    Dado una persona nueva con correo único "ana" en el dominio "es"
    Cuando se registra como "Ana López Ruiz" con la contraseña "una-clave-bien-larga-2026"
    Entonces la respuesta tiene estado 200
    Y recibe un correo con asunto "Confirma tu correo" desde "Mi Cita en Tiempo"
    Cuando intenta entrar con la contraseña "una-clave-bien-larga-2026"
    Entonces la respuesta tiene estado 403
    Cuando abre el enlace de verificación del correo
    Y entra con la contraseña "una-clave-bien-larga-2026"
    Entonces la respuesta tiene estado 200
    Y su cuenta tiene el idioma "es"

  @critico
  Escenario: Registrarse en inglés envía el correo en inglés desde su dominio
    Dado una persona nueva con correo único "john" en el dominio "en"
    Cuando se registra como "John Smith" con la contraseña "a-long-enough-password-26"
    Entonces recibe un correo con asunto "Confirm your email" desde "My Appointment On Time"

  Esquema del escenario: Se rechazan correos no válidos
    Dado una persona con el correo "<correo>" en el dominio "es"
    Cuando se registra como "Prueba" con la contraseña "una-clave-bien-larga-2026"
    Entonces la respuesta tiene estado 400
    Y la respuesta contiene "<codigo>"

    Ejemplos:
      | correo                 | codigo         |
      | sin-arroba.com         | INVALID_FORMAT |
      | alguien@mailinator.com | DISPOSABLE     |

  Escenario: La contraseña debe tener al menos 12 caracteres
    Dado una persona nueva con correo único "corta" en el dominio "es"
    Cuando se registra como "Corta" con la contraseña "corta123"
    Entonces la respuesta tiene estado 400

  @critico
  Escenario: La sesión de un dominio no vale en el otro
    Dado una persona registrada y verificada con correo único "sesion" en el dominio "es"
    Cuando consulta su cuenta en el dominio "es"
    Entonces la respuesta tiene estado 200
    Cuando consulta su cuenta en el dominio "en"
    Entonces la respuesta tiene estado 401

  @critico
  Escenario: Al crear la organización empieza la prueba gratuita de 30 días
    Dado una persona registrada y verificada con correo único "negocio" en el dominio "es"
    Cuando crea la organización "Clínica Sol" con el plan "personal"
    Entonces la respuesta tiene estado 201
    Y la organización está en prueba hasta dentro de 30 días
    Y su límite de tableros es 1
