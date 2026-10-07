# language: es
@humo-produccion
Característica: Humo en producción
  Comprobaciones de solo lectura tras cada despliegue (ES_URL, EN_URL y, si se da, EXPECTED_SHA). No crean
  cuentas ni citas, así que también corren en local.

  Esquema del escenario: El dominio «<dominio>» sirve la revisión desplegada con sus cabeceras de seguridad
    Entonces "/version.json" y "/api/healthz" del dominio "<dominio>" sirven la misma revisión
    Y la página de inicio del dominio "<dominio>" responde con las cabeceras de seguridad
    Y "/robots.txt" y "/sitemap.xml" del dominio "<dominio>" responden
    Y el descubrimiento MCP del dominio "<dominio>" apunta a su propio emisor

    Ejemplos:
      | dominio |
      | es      |
      | en      |
