# language: es
@facturacion
Característica: Planes, prueba gratuita y facturación
  Solo suscripción. Stripe está implementado y apagado (decisión del 2026-10-06): sin claves, «Disponible
  pronto» y la prueba no vence (RF-03, RF-04).

  @humo @critico
  Escenario: Sin Stripe, como en producción, la prueba no vence y contratar está «Disponible pronto»
    Dado un propietario "Laura" con plan "personal" en el dominio "es"
    Entonces la facturación de "Laura" está apagada y su prueba no tiene fecha de fin
    Cuando "Laura" abre la página de facturación
    Entonces ve el botón «Disponible pronto» desactivado
    Y la página no carga ningún script de Stripe

  @stripe @reloj @critico
  Escenario: Contratar el plan Personal y reenvío del webhook sin efectos dobles
    Dado la facturación usa el Stripe de pruebas
    Y un propietario "Laura" con plan "personal" en el dominio "es"
    Cuando "Laura" contrata el plan "personal"
    Entonces Stripe recibe un pago integrado con los días de prueba restantes
    Cuando Stripe confirma la suscripción "active" de "Laura" con el plan "personal"
    Entonces la organización de "Laura" está "active" con el plan "personal"
    Cuando Stripe reenvía el mismo evento
    Entonces el reenvío no tiene efectos

  @stripe @reloj @critico
  Escenario: Un pago fallido pasa a pendiente y, a los 7 días, a solo lectura
    Dado la facturación usa el Stripe de pruebas
    Y un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene el tablero "Consultas" en "America/Mexico_City" del país "MX"
    Y el tablero tiene el servicio "Consulta general" de 30 minutos
    Y "Laura" tiene la suscripción "active" con el plan "personal"
    Cuando Stripe avisa de un pago fallido de "Laura"
    Entonces la organización de "Laura" está "past_due" con el plan "personal"
    Y "Laura" recibe un correo con el asunto "Tu cuenta de Mi Cita en Tiempo"
    Cuando pasan 8 días
    Entonces la organización de "Laura" está "read_only" con el plan "personal"
    Y el tablero no acepta reservas

  @stripe @reloj
  Escenario: La prueba vence sin suscripción
    Dado la facturación usa el Stripe de pruebas
    Y un propietario "Laura" con plan "personal" en el dominio "es"
    Cuando pasan 31 días
    Entonces la organización de "Laura" está "read_only" con el plan "personal"

  @stripe @reloj
  Escenario: Un evento viejo que llega tarde no deshace el estado
    Dado la facturación usa el Stripe de pruebas
    Y un propietario "Laura" con plan "personal" en el dominio "es"
    Y "Laura" tiene la suscripción "active" con el plan "personal"
    Cuando llega tarde un evento viejo de suscripción "past_due" de "Laura"
    Entonces la organización de "Laura" está "active" con el plan "personal"

  @stripe @reloj
  Escenario: Bajar de plan exige un solo tablero activo
    Dado la facturación usa el Stripe de pruebas
    Y un propietario "Marco" con plan "branches" en el dominio "es"
    Y "Marco" tiene el tablero "Centro" en "America/Mexico_City" del país "MX"
    Y "Marco" tiene el tablero "Norte" en "America/Mexico_City" del país "MX"
    Cuando "Marco" cambia al plan "personal"
    Entonces la respuesta tiene estado 409
    Y la respuesta contiene "too_many_calendars"
    Cuando "Marco" archiva el tablero actual y cambia al plan "personal"
    Entonces la organización de "Marco" está "trialing" con el plan "personal"
