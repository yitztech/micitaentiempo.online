# language: es
@backend
@movil
Característica: Sedes con el cliente móvil real
  La app usa `createMobileClient`. Sus métodos de sedes se prueban contra la API real, no contra un servidor
  simulado, para que un cambio de contrato en cualquiera de los dos lados se detecte aquí.

  @critico
  Escenario: Crear, asignar y borrar una sede desde el cliente móvil
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y "Ana" abre su perfil de negocio
    Cuando "Ana" entra con el cliente móvil
    Y "Ana" crea la sede "Centro" con el cliente móvil
    Entonces la API lista la sede "Centro" de "Ana"
    Cuando "Ana" asigna la sede al tablero con el cliente móvil
    Entonces la API confirma el perfil con una versión nueva
    Cuando "Ana" quita la sede del tablero con el cliente móvil
    Y "Ana" borra la sede con el cliente móvil
    Entonces la API no lista sedes de "Ana"
