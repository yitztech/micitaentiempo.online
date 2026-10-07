# language: es
@idiomas @publico
Característica: Páginas públicas en español e inglés
  Cada página existe en los dos dominios con su ruta traducida, sin barreras de accesibilidad graves,
  sin textos fuera de los catálogos y dentro del presupuesto de JavaScript (RF-16, RF-20).

  @critico
  Esquema del escenario: Cada página pública enlaza con su par en el otro idioma
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces el documento tiene lang="<dominio>"
    Y el canonical apunta a "<ruta>" en el dominio "<dominio>"
    Y enlaza con hreflang "<otro>" a "<par>" en el dominio "<otro>"
    Y no hubo redirección automática

    Ejemplos:
      | dominio | ruta                  | otro | par              |
      | es      | /funciones            | en   | /features        |
      | es      | /precios              | en   | /pricing         |
      | es      | /preguntas-frecuentes | en   | /faq             |
      | es      | /conecta-tu-ia        | en   | /connect-your-ai |
      | es      | /contacto             | en   | /contact         |
      | es      | /privacidad           | en   | /privacy         |
      | en      | /terms                | es   | /condiciones     |
      | en      | /credits              | es   | /creditos        |

  Escenario: Una ruta del otro idioma lleva a su par en el mismo dominio
    Cuando se consulta "/pricing" en el dominio "es"
    Entonces la respuesta tiene estado 301
    Y la respuesta redirige a "/precios"
    Cuando se consulta "/precios" en el dominio "en"
    Entonces la respuesta tiene estado 301
    Y la respuesta redirige a "/pricing"

  Escenario: El sitemap lista las páginas públicas con su par
    Cuando se consulta "/sitemap.xml" en el dominio "es"
    Entonces la respuesta contiene "http://micitaentiempo.localhost:8080/precios"
    Y la respuesta contiene "http://myappointmentontime.localhost:8080/pricing"
    Y la respuesta no contiene "/entrar"

  Escenario: Las páginas de acceso no se indexan
    Cuando un visitante abre la página "/entrar" del dominio "es"
    Entonces la página pide no indexarse

  @critico
  Esquema del escenario: Sin barreras de accesibilidad graves
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces axe no encuentra problemas graves ni críticos

    Ejemplos:
      | dominio | ruta        |
      | es      | /           |
      | en      | /pricing    |
      | es      | /registro   |
      | en      | /sign-in    |
      | es      | /contacto   |
      | en      | /faq        |

  @critico
  Escenario: Ningún texto de las páginas públicas queda sin traducir
    Entonces las páginas públicas no repiten frases entre los dos idiomas

  Escenario: La portada respeta el presupuesto de JavaScript
    Cuando un visitante abre la página "/" del dominio "es"
    Entonces la página carga como mucho 130 KB de JavaScript comprimido
