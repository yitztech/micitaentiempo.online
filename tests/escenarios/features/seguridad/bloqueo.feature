# language: es
@backend
@seguridad
Característica: Bloqueo de cuentas efectivo en autenticación y permisos
  Una cuenta bloqueada desde el panel de administración pierde de inmediato todo acceso, sin revelar
  que existe ni el motivo, y el bloqueo de un colaborador no afecta a la organización de otro propietario.

  @critico
  Escenario: Una cuenta bloqueada pierde cookie, Bearer y contraseña, y los recupera al desbloquearla
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" obtiene un token Bearer de su sesión
    Cuando la administración bloquea a "Ana"
    Entonces la sesión por cookie de "Ana" es rechazada con 401
    Y el token Bearer de "Ana" es rechazado con 401
    Y "Ana" no puede entrar con su contraseña y recibe un 401 genérico
    Cuando la administración desbloquea a "Ana"
    Entonces "Ana" puede entrar de nuevo con su contraseña

  @critico
  Escenario: Una conexión MCP ya emitida deja de funcionar al bloquear a la persona
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Cuando "Ana" conecta una aplicación por registro dinámico con permisos "calendar:read"
    Y la administración bloquea a "Ana"
    Entonces el token MCP de la conexión es rechazado con 401 invalid_token

  @critico
  Escenario: Bloquear a un colaborador no suspende la organización del propietario
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Cuando "Ana" invita a "Olga" como "observer"
    Y "Olga" se registra con el correo invitado y acepta la invitación
    Y la administración bloquea a "Olga"
    Entonces "Ana" puede cambiar el horario del tablero
    Y el calendario público del tablero responde 200

  @critico
  Escenario: Bloquear al propietario oculta el calendario público y conserva la lectura de los demás miembros
    Dado un propietario "Ana" con plan "personal" en el dominio "es"
    Y "Ana" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Cuando "Ana" invita a "Pablo" como "observer"
    Y "Pablo" se registra con el correo invitado y acepta la invitación
    Y la administración bloquea a "Ana"
    Entonces el calendario público del tablero responde 404
    Y "Pablo" sigue viendo el tablero con acceso de lectura
