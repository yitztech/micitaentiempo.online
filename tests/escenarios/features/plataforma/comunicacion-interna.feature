# language: es
@plataforma @humo
Característica: Comunicación interna entre api y el motor
  api llama al motor con un actor firmado; el motor no acepta llamadas sin él.

  Escenario: api habla con el motor en nombre de un actor
    Cuando se consulta "/api/__test/ping" en el dominio "es"
    Entonces la respuesta tiene estado 200
    Y la respuesta JSON tiene el campo "revision"
    Y la respuesta contiene "\"userId\":\"test-user\""

  @reloj
  Escenario: El reloj de pruebas del motor se puede fijar
    Cuando se fija el reloj del sistema en "2026-11-02T14:00:00Z"
    Entonces la respuesta tiene estado 201
    Y la respuesta contiene "2026-11-02T14:00"
    Cuando se fija el reloj del sistema en "2026-09-14T12:00:00Z"
    Entonces la respuesta tiene estado 201
