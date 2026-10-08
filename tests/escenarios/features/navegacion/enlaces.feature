# language: es
@enlaces @publico
Característica: Validación y funcionamiento de todos los enlaces de la plataforma
  Cada enlace presente en la interfaz debe apuntar a un destino válido, responder con código HTTP exitoso
  y permitir navegar entre secciones, idiomas y documentos legales sin enlaces rotos (404/500).

  @critico
  Esquema del escenario: Todos los enlaces de la página "<ruta>" en el dominio "<dominio>" son válidos
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces todos los enlaces de la página son válidos y responden con éxito

    Ejemplos:
      | dominio | ruta                  |
      | es      | /                     |
      | es      | /precios              |
      | es      | /funciones            |
      | es      | /preguntas-frecuentes |
      | es      | /conecta-tu-ia        |
      | es      | /contacto             |
      | es      | /condiciones          |
      | es      | /privacidad           |
      | es      | /creditos             |
      | es      | /entrar               |
      | es      | /registro             |
      | en      | /                     |
      | en      | /pricing              |
      | en      | /features             |
      | en      | /faq                  |
      | en      | /connect-your-ai      |
      | en      | /contact              |
      | en      | /terms                |
      | en      | /privacy              |
      | en      | /credits              |
      | en      | /sign-in              |
      | en      | /sign-up              |

  @critico @movil @tableta
  Escenario: Navegación interactiva a través de los enlaces de la cabecera
    Cuando un visitante abre la página "/" del dominio "es"
    Y hace clic en el enlace "Precios" de la cabecera
    Entonces la página actual tiene la ruta "/precios"
    Cuando hace clic en el enlace "Funciones" de la cabecera
    Entonces la página actual tiene la ruta "/funciones"
    Cuando hace clic en el enlace "Ayuda" de la cabecera
    Entonces la página actual tiene la ruta "/preguntas-frecuentes"
    Cuando hace clic en el enlace "Mis citas" de la cabecera
    Entonces la página actual tiene la ruta "/citas"
    Cuando hace clic en el logo de la cabecera
    Entonces la página actual tiene la ruta "/"

  @movil @tableta
  Escenario: Navegación interactiva a través de los enlaces del pie de página
    Cuando un visitante abre la página "/" del dominio "es"
    Y hace clic en el enlace "Contacto" del pie de página
    Entonces la página actual tiene la ruta "/contacto"
    Cuando hace clic en el enlace "Privacidad" del pie de página
    Entonces la página actual tiene la ruta "/privacidad"
    Y el documento legal tiene el título "Aviso de privacidad" y contenido
    Cuando hace clic en el enlace "Condiciones" del pie de página
    Entonces la página actual tiene la ruta "/condiciones"
    Y el documento legal tiene el título "Condiciones de uso" y contenido
    Cuando hace clic en el enlace "Créditos" del pie de página
    Entonces la página actual tiene la ruta "/creditos"
    Y el documento legal tiene el título "Créditos" y contenido

  @critico @movil @tableta
  Escenario: El enlace de cambio de idioma navega al par del otro dominio
    Cuando un visitante abre la página "/precios" del dominio "es"
    Y cambia de idioma usando el enlace de idioma de la cabecera
    Entonces la página actual está en el dominio "en"
    Y la página actual tiene la ruta "/pricing"
    Cuando cambia de idioma usando el enlace de idioma de la cabecera
    Entonces la página actual está en el dominio "es"
    Y la página actual tiene la ruta "/precios"

  @critico @movil @tableta
  Escenario: Los documentos legales en inglés funcionan al navegar desde el pie
    Cuando un visitante abre la página "/" del dominio "en"
    Y hace clic en el enlace "Privacy" del pie de página
    Entonces la página actual tiene la ruta "/privacy"
    Y el documento legal tiene el título "Privacy notice" y contenido
    Cuando hace clic en el enlace "Terms" del pie de página
    Entonces la página actual tiene la ruta "/terms"
    Y el documento legal tiene el título "Terms of use" y contenido
    Cuando hace clic en el enlace "Credits" del pie de página
    Entonces la página actual tiene la ruta "/credits"
    Y el documento legal tiene el título "Credits" y contenido

  Escenario: Todos los enlaces en la página de reserva pública y «Mis citas» son válidos
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Cuando la visitante "Carla" abre la página de reserva del tablero en el dominio "es"
    Entonces todos los enlaces de la página son válidos y responden con éxito
    Cuando un visitante abre la página "/citas" del dominio "es"
    Entonces todos los enlaces de la página son válidos y responden con éxito
