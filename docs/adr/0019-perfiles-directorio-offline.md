# 0019. Perfiles de negocio, directorio y trabajo sin conexión

- Estado: aceptada para implementar por etapas; dependencias nuevas aún sin autorizar.
- Fecha: 2026-10-27
- Alcance: C0 del plan 12; este ADR no acredita endpoints ni apps implementados.

## Identidad, permisos y publicación

Una persona conserva una cuenta; un perfil por organización, identificado por el UUID inmutable de
esta. Propietario se deriva de `organizations.owner_user_id`, no de un rol enviado ni de ser editor.
Los clientes sin negocio conservan directorio y citas. Las capacidades del DTO son informativas:
siempre se vuelve a autorizar en el servidor. No ampliar suscripciones ni reescribir autenticación.

La revisión global del perfil empieza en 1 e incrementa en toda modificación de contenido, sedes,
vínculos o imágenes. Todas estas operaciones comprueban `expectedVersion` dentro de una transacción.
Las actualizaciones mandan el contenido editable completo, no un merge implícito de listas. Una
versión antigua recibe 409 `profile_conflict` y conserva el borrador. Un PATCH del perfil publicado
se refleja públicamente al guardar; no hay copia editorial paralela.

| Organización/perfil/calendario | Lectura pública | Directorio reservable | Reserva |
|---|---|---|---|
| Perfil draft/unpublished | 404 | No | Flujo directo existente conserva sus reglas |
| Organización suspended/eliminada | 404 | No | Rechazar según política existente |
| Published + read_only | Sí | No | Deshabilitada |
| Published + sin calendario/servicio activo | Sí | No | Deshabilitada |
| Published + elegible + calendario/servicio activo | Sí | Sí | Motor valida disponibilidad de nuevo |
| RPC temporalmente caído | 503 al consultar detalle que lo necesita | Proyección local; sin RPC por resultado | Error recuperable |

La publicación exige descripción no vacía, categoría, sede con país/localidad, calendario y servicio
activo; imágenes opcionales. No publicar coordenadas/dirección precisas en modo `locality`. El DTO
público es una lista blanca independiente del privado. Catálogo inicial: códigos de BusinessCategory;
traducción de etiquetas en los seis idiomas se entrega cuando se añada su primera interfaz/respuesta.

## Contratos y discrepancias verificadas

Los contratos nuevos viven en `packages/schemas/src/business.ts` y `offline.ts`. Sus límites cuentan
puntos de código tras trim; los contratos previos `text.ts` siguen usando UTF-16 y no se alteran aquí.
El contador HTML nativo también usa UTF-16: la UI nueva debe permitir caracteres suplementarios hasta
el límite lógico mediante validación/contador compartido, con maxlength de apoyo de hasta 2× el límite,
sin recortar pegados en silencio. Las restricciones SQL nuevas usarán `char_length`.

`openapi.yaml` es JSON válido como YAML 1.2, generado desde Zod con
`pnpm --filter @mcet/schemas openapi` después de compilar. `test:schemas` comprueba que no esté obsoleto.
Los refinamientos semánticos (coordenadas por parejas, duplicados, hosts, etc.) se ejecutan en Zod;
JSON Schema no expresa todos ellos. El documento se marca como diseño, no inventario de API operativa.
La comprobación de implementación HTTP con estos contratos se añade con C2/C4, contra servidor real.

La cookie existente se genera con prefijo `mcet` y `useSecureCookies`; Better Auth usa
`__Secure-mcet.session_token` en HTTPS (`mcet.session_token` en desarrollo HTTP). C0 documenta la
realidad sin modificar sesiones. La exigencia de cookie `__Host-` de la plataforma requiere revisión
específica compatible antes del cierre C9; no asumir que ya se cumple.

Servicios públicos del perfil: máximo 100 por página, continuación con cursor y endpoint
`GET /api/public/v1/businesses/:businessId/services` por concretar con el DTO de servicio del motor en
C4. No truncar silenciosamente. El límite de diez calendarios procede del plan vigente. El directorio
usa solo modo localidad o radio por consulta, nunca una mezcla ambigua. Cursores autenticados y
ligados a filtros/orden con la infraestructura criptográfica existente, no solo base64 de IDs.

## Proyección y reconciliación

El receptor de eventos existente deduplica por event_id, pero `DomainEvent.version` es versión del
formato, no necesariamente revisión del calendario. No utilizarla como revisión de agregado.
C1 añadirá revisión monótona persistida en el motor para calendario/servicios y un snapshot de
proyección tipado (`BusinessCalendarProjectionEvent`), emitido en la misma transacción/outbox que
el cambio. Solo aplicar revisiones mayores; persistir tombstones de borrado para impedir resurrección.
Las altas/modificaciones/bajas de servicios actualizan la misma revisión del calendario.

La reconciliación lee snapshots autorizados por organización en páginas de 100 cada 60 segundos;
reintenta de manera acotada, conserva checkpoints y no interpreta fallo RPC como borrado. Una
organización suspendida/eliminada y un perfil retirado se filtran por estado canónico mediante join,
aunque la proyección esté atrasada. Eventos antiguos y reconciliación usan la misma comparación de
revisión. C1 debe ampliar proto/motor; el snapshot nuevo no existe todavía en el RPC actual.

## Offline: almacenamiento y seguridad

Elección propuesta: SQLite transaccional con cifrado mantenido compatible con Expo, claves en el
almacenamiento seguro del sistema y archivos privados cifrados. Evaluar `expo-sqlite` con SQLCipher,
`expo-secure-store`, selección de imágenes, ubicación y detección de red. No están instalados ni
autorizados por este ADR; verificar compatibilidad de las versiones actuales y solicitar autorización
específica antes de añadir dependencias. No sustituir cifrado por AsyncStorage en claro.

Los valores iniciales están en `OFFLINE_LIMITS`: acceso privado y caché pública 24 h desde validación;
agenda 30 días atrás/90 adelante; 10 000 registros; caché de medios 50 MiB; 100 operaciones pendientes;
archivos pendientes 20 MiB. Antes de exceder cuota ofrecer liberación explícita de caché no pendiente;
no borrar borradores/pendientes automáticamente. Operaciones deben enviarse antes de 24 h; después
quedan expiradas para revisión, nunca se confirman tardíamente sin intervención. Credenciales,
passwords, OTP y holds no forman parte del payload durable. Clock rollback no extiende vigencia:
persistir referencia temporal de servidor y tratar retrocesos como necesidad de reautenticación.

Aislar por servidor canónico/configuración, entorno, cuenta y organización (no solo el texto
`production`). Cada instalación/servidor usa almacenamiento y claves separados. Logout confirmado
borra privados y pendientes; alertar antes si se perderían cambios. Primer uso offline no inventa datos.
Abrir, matar el proceso y abrir de nuevo sin red debe conservar lo permitido sin requerir bootstrap.

## Offline: protocolo y efectos

1. Guardar borrador y registro de operación en la misma transacción. operationId es UUID aleatorio
   estable (generador mantenido), usado como Idempotency-Key en todos los reintentos. No crear un ID
   nuevo tras un timeout. `resourceId` identifica recurso o ID provisional local; traducir dependencias
   a IDs del servidor de forma transaccional al confirmar altas.
2. Envíos autenticados solo de la misma cuenta; primero revalidar sesión, permisos y reloj. Registro
   durable del servidor por actor + operación + hash de payload; mismo ID con otro payload devuelve
   409 `idempotency_mismatch`. Registrar efecto y recibo en transacción o coordinarlo con el motor
   usando el mismo ID persistente. No basta una caché en memoria ni un recibo escrito después del efecto.
3. C8b añade `GET /api/offline/operations/:operationId`: solo el actor puede recuperar estado/resultado;
   404 si no se conoce, 410 si caducó. Retención 90 días, frente a ventana máxima de envío de 24 h.
   Un recibo desconocido/caducado después de una respuesta perdida **no autoriza repetir el efecto**:
   reconciliar el recurso/registro idempotente del motor; si no se puede, detener para revisión.
4. Reserva offline es intención. El flujo público actual exige ALTCHA y hold de diez minutos; no
   reintentar un hold viejo, no persistir sus tokens, no eludir verificación de contacto ni antibots.
   C8b conserva la intención y pide interacción al reconectar si falta verificación. Solo operaciones
   de cuenta ya autorizadas y con requisitos completos se envían automáticamente. Garantía de
   exclusión y reprogramación atómica continúa en Go/PostgreSQL, no en SQLite.
5. Nueva reserva pendiente no ocupa plaza. Reprogramación mantiene cita original hasta commit; cancelar
   pendiente mantiene cita/avisos hasta confirmación. Publicación/retirada, pagos y borrados de cuenta
   exigen conexión y acción explícita; no son tipos admitidos en la cola.
6. 401 pausa y pide login de la misma cuenta; 403 falla y refresca/purga permisos; 409 conserva propuesta
   y exige elección; 422 marca error editable; 429 respeta Retry-After; red/503 reintenta con backoff y
   jitter, máximo cinco intentos por ciclo, luego ofrece reintento manual. Orden por recurso y
   dependencias; una sola ejecución por operación incluso al alternar primer plano/conectividad.
7. Descarga propuesta `GET /api/offline/changes?cursor=&limit=100`: cursor opaco por actor, permisos,
   instalación y versión de esquema; hasta 100 cambios + nextCursor y serverTime. Upserts/bajas con
   revisión monótona y DTO mínimo del recurso. Persistir página y cursor atómicamente. Cursor vencido:
   410 `sync_cursor_expired`; reconstrucción de snapshot paginado consistente con watermark, sin perder
   cola local. La autorización se reevalúa en cada página. No exponer cambios de otras cuentas.
8. Catálogo de recursos inicial: citas propias, agenda autorizada, perfil privado/sedes propios y
   perfiles públicos guardados. Cambios de permisos/bajas generan invalidación explícita; una app sin
   red solo puede reconocerlos al reconectar o al vencer TTL. No prometer retirada retroactiva de copias.

Los envelopes HTTP de operaciones/cambios y los payloads específicos se implementan con C8b una vez
que los recursos reales estén disponibles; los metadatos actuales no se aceptan como escritura remota.
Su comprobación HTTP queda pendiente, expresamente, en el registro del plan.

## Evidencia requerida

C0: ejemplos válidos/invalidos, compilación, generación de OpenAPI consistente y escenarios de aceptación
escritos. C1–C8b: integración real de persistencia, autorización y concurrencia. C8c: Android/iOS nativos,
teléfono y tableta, red cortada y reinicio. No sustituir estos resultados por mocks o emulación de navegador.
