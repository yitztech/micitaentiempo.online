# language: es
@mcp
Característica: Conecta tu IA (MCP)
  Una aplicación de IA se conecta por OAuth (CIMD o registro dinámico), actúa con los permisos de quien la
  conectó y solo ve los tableros que eligió (RF-18, docs/plan/06-mcp.md).

  Antecedentes:
    Dado un propietario "Marta" con plan "personal" en el dominio "es"
    Y "Marta" tiene el tablero "Estudio" en "America/Mexico_City" del país "MX"
    Y el tablero abre de lunes a viernes de "09:00" a "18:00" con comida de "14:00" a "15:00"
    Y el tablero tiene el servicio "Corte" de 30 minutos

  @critico
  Escenario: Conectar con CIMD y consentimiento; la IA lista tableros y huecos
    Cuando "Marta" conecta desde el navegador la aplicación "https://asistente.example/oauth/client.json" con permisos "profile calendar:read offline_access"
    Entonces la aplicación recibe un token para el recurso "/mcp"
    Y la IA ve el tablero "Estudio"
    Y la IA encuentra huecos libres del servicio
    Y "Marta" recibe el correo de nueva aplicación conectada
    Y en Panel → IA aparece la aplicación "Asistente de prueba"

  Escenario: Con permiso de escritura la IA bloquea tiempo; con solo lectura se le niega
    Cuando "Marta" conecta una aplicación por registro dinámico con permisos "calendar:read calendar:write"
    Y la IA bloquea una hora del tablero dentro de 20 días
    Entonces el bloqueo queda hecho por "mcp"
    Cuando "Marta" conecta una aplicación por registro dinámico con permisos "calendar:read"
    Y la IA bloquea una hora del tablero dentro de 20 días
    Entonces la IA recibe el error de permiso "calendar:write"

  @critico
  Escenario: Un token de otra organización no ve nada
    Dado un propietario "Pedro" con plan "personal" en el dominio "es"
    Cuando "Pedro" conecta una aplicación por registro dinámico con permisos "calendar:read"
    Entonces la IA no ve ningún tablero
    Y la IA no puede leer los eventos del tablero "Estudio"

  Escenario: Solo los tableros elegidos en el consentimiento
    Dado un propietario "Sara" con plan "branches" en el dominio "es"
    Y "Sara" tiene el tablero "Sucursal norte" en "America/Mexico_City" del país "MX"
    Y "Sara" tiene el tablero "Sucursal centro" en "America/Mexico_City" del país "MX"
    Cuando "Sara" conecta una aplicación por registro dinámico con permisos "calendar:read" solo para el tablero "Sucursal centro"
    Entonces la IA ve el tablero "Sucursal centro"
    Y la IA no puede leer los eventos del tablero "Sucursal norte"

  Escenario: Revocar en el panel corta el acceso al momento
    Cuando "Marta" conecta una aplicación por registro dinámico con permisos "calendar:read"
    Y "Marta" revoca la aplicación en Panel → IA
    Entonces /mcp rechaza el token con el desafío OAuth

  Escenario: Cliente del protocolo 2026-07-28 en el dominio en inglés, con refresh token
    Dado un propietario "Mary" con plan "personal" en el dominio "en"
    Y "Mary" tiene el tablero "Studio" en "America/New_York" del país "US"
    Cuando "Mary" conecta una aplicación por registro dinámico con permisos "calendar:read offline_access"
    Entonces una IA con el protocolo "2026-07-28" ve el tablero "Studio"
    Y el resumen de la herramienta está en "en"
    Y el refresh token da un token nuevo

  Escenario: Descubrimiento OAuth sin token
    Cuando una IA llama a /mcp sin token en el dominio "es"
    Entonces recibe 401 con "resource_metadata"
    Y los metadatos del recurso apuntan al emisor "/api/auth" y al recurso "/mcp"
