# language: es
@idiomas @humo
Característica: El idioma lo decide el dominio
  La misma app responde en los dos dominios; el idioma nunca depende de Accept-Language ni de la IP.

  Esquema del escenario: Cada dominio sirve su idioma y enlaza con su par
    Cuando un visitante abre la página "<ruta>" del dominio "<dominio>"
    Entonces el documento tiene lang="<idioma>"
    Y el canonical apunta a "<ruta>" en el dominio "<dominio>"
    Y enlaza con hreflang "<otro>" a "<par>" en el dominio "<otro>"
    Y hay un enlace x-default al dominio "es"
    Y no hubo redirección automática

    Ejemplos:
      | dominio | ruta | idioma | otro | par |
      | es      | /    | es     | en   | /   |
      | en      | /    | en     | es   | /   |

  Escenario: Accept-Language no cambia el idioma
    Cuando un visitante con el navegador en inglés abre la página "/" del dominio "es"
    Entonces el documento tiene lang="es"

  Escenario: Cada dominio publica su sitemap y su robots.txt
    Cuando se consulta "/sitemap.xml" en el dominio "en"
    Entonces la respuesta tiene estado 200
    Y la respuesta contiene "http://myappointmentontime.localhost:8080/"
    Cuando se consulta "/robots.txt" en el dominio "es"
    Entonces la respuesta contiene "Sitemap: http://micitaentiempo.localhost:8080/sitemap.xml"
