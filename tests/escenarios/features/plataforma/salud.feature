# language: es
@plataforma @humo
Característica: Contrato con la plataforma
  La plataforma da un despliegue por bueno cuando el gateway responde y sirve el commit desplegado.

  Escenario: El gateway responde y publica la revisión desplegada
    Cuando se consulta "/healthz" en el dominio "es"
    Entonces la respuesta tiene estado 200
    Cuando se consulta "/version.json" en el dominio "es"
    Entonces la respuesta tiene estado 200
    Y la respuesta JSON tiene el campo "revision"

  Escenario: La API responde a través del gateway
    Cuando se consulta "/api/healthz" en el dominio "en"
    Entonces la respuesta tiene estado 200
    Y la respuesta JSON tiene el campo "revision"

  Escenario: Los puertos internos no se publican por el gateway
    Cuando se consulta "/readyz" en el dominio "es"
    Entonces la respuesta tiene estado 404
