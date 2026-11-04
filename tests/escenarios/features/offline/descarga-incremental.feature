# language: es
@backend
@offline
Característica: Descarga incremental offline del perfil y las sedes
  La app móvil descarga el estado real del negocio y sus cambios con un cursor firmado. Nunca recibe una
  respuesta vacía fija, ni datos de otra cuenta, y un cursor que no sirve se rechaza con un error claro.

  @critico
  Escenario: Snapshot inicial, cambios posteriores y repetición del cursor sin duplicados
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" abre su perfil de negocio
    Cuando "Ana" descarga los cambios sin cursor
    Entonces la descarga es un snapshot con reinicio que incluye el perfil de "Ana"
    Y la descarga declara los recursos sincronizados y los no soportados
    Cuando "Ana" cambia el nombre de su negocio a "Clínica Renovada"
    Y "Ana" descarga los cambios con el cursor anterior
    Entonces la descarga trae el perfil con el nombre "Clínica Renovada"
    Cuando "Ana" descarga los cambios con el cursor anterior
    Entonces la descarga no trae elementos nuevos

  @critico @seguridad
  Escenario: Un cursor de otra cuenta o manipulado se rechaza y no se filtran datos
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y un propietario "Bea" con plan "personal" en el dominio "es"
    Y "Ana" abre su perfil de negocio
    Y "Bea" abre su perfil de negocio
    Cuando "Ana" descarga los cambios sin cursor
    Y "Bea" usa el cursor de "Ana" para descargar cambios
    Entonces la descarga se rechaza con 400 invalid_cursor
    Cuando "Ana" descarga los cambios con un cursor manipulado
    Entonces la descarga se rechaza con 400 invalid_cursor
    Cuando "Bea" descarga los cambios sin cursor
    Entonces la descarga no contiene datos de "Ana"
