# language: es
@plataforma @seo
Característica: Cada URL en un solo estado para los buscadores
  Pública (200 y en el sitemap), privada (noindex), inexistente (404) o movida (301 en un salto).
  Search Console avisa de cualquier otra cosa (AGENTS.md §9.2).

  @WEB-06
  Esquema del escenario: Una ruta que no existe responde 404
    Cuando se consulta "<ruta>" en el dominio "<dominio>"
    Entonces la respuesta tiene estado 404

    Ejemplos:
      | dominio | ruta                    |
      | es      | /no-existe-prueba       |
      | es      | /reservar/no-existe-xyz |
      | en      | /no-such-page           |

  @WEB-07
  Esquema del escenario: robots.txt no bloquea nada y la API lleva noindex en la cabecera
    Cuando se consulta "/robots.txt" en el dominio "<dominio>"
    Entonces robots.txt no lleva Disallow
    Cuando se consulta "/api/health" en el dominio "<dominio>"
    Entonces la respuesta lleva X-Robots-Tag noindex

    Ejemplos:
      | dominio |
      | es      |
      | en      |

  @WEB-08
  Esquema del escenario: Cada URL del sitemap es pública y su canonical es ella misma
    Cuando se consulta "/sitemap.xml" en el dominio "<dominio>"
    Entonces cada URL del sitemap responde 200 sin noindex y con su canonical

    Ejemplos:
      | dominio |
      | es      |
      | en      |

  @WEB-09
  Esquema del escenario: La otra forma de una URL redirige con 301 a la buena
    Cuando se consulta "<ruta>" en el dominio "es"
    Entonces la respuesta tiene estado 301
    Y la respuesta redirige a "<destino>"

    Ejemplos:
      | ruta        | destino  |
      | /precios/   | /precios |
      | /index.html | /        |
