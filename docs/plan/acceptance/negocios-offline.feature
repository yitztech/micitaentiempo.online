# language: es
# Especificación de aceptación C0. No ejecutada: adaptar steps y mover al runner por tarea.
# Se mantiene fuera de features/ para no introducir pasos indefinidos en las suites actuales.
@negocios @directorio @perfil-negocio
Característica: Perfil único, directorio y apps sin conexión
  Escenario: Un cliente no tiene que registrar negocio para reservar
    Dado una cuenta sin organización ni calendarios
    Cuando entra en su cuenta
    Entonces puede consultar el directorio y sus citas sin completar un alta de negocio

  Escenario: El propietario publica un perfil con varios calendarios
    Dado una organización con dos calendarios reservables en distintas sedes
    Cuando su propietario completa y publica su perfil
    Entonces aparece un solo negocio en el directorio
    Y la reserva utiliza la sede y calendario elegidos

  Escenario: Otro propietario o un editor no administra el perfil
    Dado un perfil privado de una organización ajena
    Cuando otro propietario o un editor de calendario solicita modificarlo
    Entonces la API rechaza la operación sin cambiar sus datos

  Escenario: Una dirección particular no se publica
    Dado una sede con visibilidad de localidad y coordenadas privadas
    Cuando un visitante consulta el perfil y el directorio
    Entonces no recibe dirección precisa ni coordenadas de esa sede
    Y la sede queda fuera de búsquedas por radio

  @offline @movil
  Esquema del escenario: La consulta descargada sobrevive al cierre de la app
    Dado que la app de "<plataforma>" ha descargado citas y agenda autorizadas
    Cuando se corta realmente la red y termina el proceso de la app
    Y vuelve a abrirse antes de vencer el acceso local
    Entonces muestra los datos guardados con su fecha de actualización
    Y no necesita un bootstrap remoto para abrir la cuenta local
    Ejemplos:
      | plataforma       |
      | Android teléfono |
      | Android tableta  |
      | iOS teléfono     |
      | iOS tableta      |

  @offline @sincronizacion @movil
  Escenario: Un timeout después del commit no duplica la reserva
    Dado una intención offline autorizada con identificador estable
    Cuando el servidor confirma la reserva pero la respuesta se pierde
    Y la app se reinicia y recupera conexión
    Entonces reconcilia el recibo de la misma operación
    Y solo existe una reserva y un efecto de notificación

  @offline @sincronizacion @movil
  Escenario: Otro dispositivo ocupa el horario solicitado sin conexión
    Dado una solicitud local pendiente que todavía no ocupa plaza
    Y otro dispositivo confirma la última plaza del mismo horario
    Cuando la app recupera conexión e intenta enviar la solicitud
    Entonces muestra el conflicto conservando la intención
    Y no anuncia una segunda reserva confirmada

  @offline @sincronizacion @movil
  Escenario: Una cancelación pendiente no se presenta como efectiva
    Dado una cita confirmada descargada
    Cuando su titular solicita cancelarla sin internet
    Entonces se conserva la cita confirmada con cancelación pendiente
    Y solo cambia a cancelada tras la confirmación del servidor

  @offline @sincronizacion @movil
  Escenario: Las ediciones simultáneas no se sobrescriben silenciosamente
    Dado un borrador de perfil guardado localmente en una versión anterior
    Y otro dispositivo guarda una revisión nueva del perfil
    Cuando se sincroniza el borrador antiguo
    Entonces recibe un conflicto de versión
    Y permite revisar ambos contenidos conservando el borrador

  @offline @movil
  Escenario: Un cambio de cuenta no expone ni envía pendientes ajenos
    Dado una cuenta con datos privados y operaciones pendientes locales
    Cuando confirma cerrar sesión y entra con otra cuenta
    Entonces los privados y pendientes anteriores se eliminan
    Y no se envía ninguna operación de la cuenta anterior

  @offline @sincronizacion @movil
  Escenario: Una baja remota no resucita por un pendiente antiguo
    Dado una sede descargada con una edición pendiente
    Y la sede fue eliminada en otro dispositivo
    Cuando se descargan las bajas y se reconcilia el pendiente
    Entonces la sede no reaparece en el servidor ni en el directorio
    Y la app conserva el contenido como conflicto revisable sin reenviarlo automáticamente

  @offline @movil
  Escenario: Disco o cuota llenos no aparentan guardado exitoso
    Dado que el almacenamiento local no permite otra operación durable
    Cuando se intenta guardar una edición sin conexión
    Entonces muestra un error accesible sin anunciar guardado
    Y conserva el formulario para que la persona decida cómo continuar
