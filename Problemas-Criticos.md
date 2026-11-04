# Problemas críticos y hallazgos de revisión

Fecha: 2026-11-03.
Rama revisada: `fix/seguridad-sesiones-suscripcion`.
Alcance: estado local del proyecto, incluidos los cambios móviles sin commit.

Este informe registra la revisión realizada en esta sesión. No acredita explotación en producción ni una auditoría exhaustiva. No se modificó código fuente durante la revisión. Las referencias de línea corresponden al estado revisado y pueden cambiar al aplicar correcciones.

Prioridades: **P0** crítico, **P1** alto, **P2** medio. El estado actualizado de correcciones y verificaciones aparece en el registro de seguimiento; los hallazgos originales se conservan como evidencia histórica.

## 1. P0 — Suplantación de cuentas mediante Google

**Estado actualizado:** corregido y verificado en el código y el entorno local de pruebas mediante S01–S02. Pendiente su entrega/despliegue y comprobación operativa en producción; no se ha verificado exposición histórica ni revocado sesiones reales.

**Referencia:** [google-customer.ts:72](services/api/src/public-booking/google-customer.ts#L72).

`resolveGoogleMobileIdentity` acepta un `idToken` enviado por el cliente y lo pasa a `identityOf`, que decodifica el contenido sin verificar firma ni caducidad. Después, `customerSessionFor` crea una sesión para el correo declarado. Afecta al endpoint móvil y a `/api/public/v1/google/verify`.

**Evidencia:** se reprodujo localmente la aceptación de un token inventado, con firma ficticia y caducidad vencida, que declaraba un correo ajeno de prueba. La reproducción ejercitó el resolvedor de identidad, sin crear una sesión ni acceder a cuentas reales.

**Impacto:** un atacante puede presentar una identidad fabricada para obtener acceso a la cuenta correspondiente cuando Google está configurado.

**Corrección:** verificar criptográficamente los tokens recibidos del cliente, incluyendo firma, audiencia, emisor y caducidad, antes de crear una sesión. Añadir pruebas de rechazo de tokens falsificados y vencidos. No reutilizar para este caso la confianza en el canal TLS del canje de códigos OAuth.

## 2. P0 — Administración con credenciales predeterminadas conocidas

**Referencias:** [config.ts:29](services/admin/src/config.ts#L29), [compose.prod.yml:168](compose.prod.yml#L168), [admin-db.ts:114](services/admin/src/db/admin-db.ts#L114).

La configuración contiene un usuario y una contraseña de respaldo. El servicio de administración del compose de producción no exige ni inyecta credenciales alternativas. Al inicializar una base nueva se crea esa cuenta.

**Evidencia:** una instancia local con SQLite en memoria, sin las variables de credenciales iniciales, permitió iniciar sesión con los valores predeterminados y devolvió un token. No se imprimieron credenciales ni tokens en la salida de la reproducción.

**Impacto:** una instalación nueva que use esa configuración puede exponer acceso administrativo con credenciales conocidas. No se verificó si una instalación existente conserva esa cuenta o si sus credenciales fueron rotadas.

**Corrección:** rechazar el arranque sin credenciales explícitas, exigirlas en el contrato de despliegue y revisar/rotar la cuenta y sus sesiones en instalaciones existentes.

## 3. P1 — Bloqueo administrativo sin suspensión efectiva garantizada

**Referencias:** [platform-db.ts:372](services/admin/src/db/platform-db.ts#L372), [api.routes.ts:118](services/admin/src/routes/api.routes.ts#L118).

El bloqueo borra sesiones y modifica directamente el estado de la organización en PostgreSQL. No propaga la suspensión al motor de calendarios ni marca `calendarStatusPending`. Además, captura y oculta errores, mientras el endpoint devuelve éxito. La autenticación de la API no consulta la lista local de usuarios bloqueados del administrador.

**Impacto:** el motor puede conservar el negocio activo; borrar sesiones actuales tampoco garantiza impedir nuevos inicios de sesión. El panel puede informar de un bloqueo que no se aplicó correctamente.

**Corrección:** centralizar la suspensión y revocación, incorporar el estado de bloqueo en la autenticación y propagar el cambio al motor mediante un mecanismo recuperable. Los errores deben producir una respuesta verificable y no un éxito aparente.

**Validación:** inspección del flujo y de sus consumidores; pendiente prueba de integración con ambos servicios y base real.

## 4. P1 — Desbloquear devuelve acceso activo sin revisar la suscripción

**Referencia:** [platform-db.ts:385](services/admin/src/db/platform-db.ts#L385).

`restoreUserOrg` convierte cualquier organización suspendida en `active`. No conserva el estado anterior ni consulta la suscripción.

**Impacto:** si una organización estaba en `read_only` por falta de pago, bloquearla y desbloquearla puede eliminar esa restricción. El estado de facturación queda subordinado a una acción administrativa que no comprueba el pago.

**Corrección:** separar la suspensión administrativa del estado de facturación o restaurar el estado que corresponda a la suscripción vigente, propagándolo también al motor.

**Validación:** inspección del SQL y del flujo de desbloqueo; pendiente prueba integrada de la secuencia `read_only → suspended → unblock`.

## 5. P1 — Endpoints móviles omiten límites específicos de autenticación

**Referencias:** [mobile.controller.ts:79](services/api/src/mobile/mobile.controller.ts#L79), [auth.factory.ts:183](services/api/src/auth/auth.factory.ts#L183), [default.conf.template:64](services/gateway/default.conf.template#L64).

Los endpoints móviles llaman directamente a `auth.api.signInEmail`, registro y recuperación. En Better Auth instalado, los límites configurados se ejecutan en el manejador HTTP, que esas llamadas directas omiten. El gateway aplica a estas rutas el límite público general, no el de autenticación.

**Impacto:** se debilitan las restricciones específicas contra intentos masivos de acceso, altas y abuso de correos. No significa que las rutas carezcan de todo límite: mantienen el límite público del gateway.

**Corrección:** aplicar límites explícitos y compartidos a estas rutas, por IP real y por cuenta, o integrarlas con el flujo HTTP que ya los exige. Probar respuestas 429 y `Retry-After` con configuración de producción.

**Validación:** inspección de la aplicación, del gateway y del código de Better Auth instalado; no se ejecutó una prueba de carga contra un servicio desplegado.

## 6. P1 — Perder la conexión tras el arranque no activa el modo offline

**Referencias:** [App.tsx:214](services/mobile/App.tsx#L214), [App.tsx:528](services/mobile/App.tsx#L528).

La comprobación de reconexión solo se ejecuta cuando `conn` ya es `offline`. Si la app arrancó conectada, los errores posteriores de red no cambian ese estado. El guardado del perfil decide entre envío y cola usando ese valor.

**Impacto:** al perder conexión durante el uso, guardar un perfil intenta enviarlo y falla en lugar de encolar la edición. El indicador puede continuar mostrando conexión.

**Corrección:** centralizar la detección de conectividad real con el servidor y manejar timeouts y cambios de estado durante el uso. Cubrir la transición conectado → sin red → edición → reconexión.

**Validación:** inspección de los cambios de estado y del flujo de guardado; pendiente prueba nativa.

## 7. P1 — Una operación completada puede mostrarse como caducada

**Referencia:** [sync.ts:134](services/mobile/src/sync.ts#L134).

La sincronización comprueba la caducidad antes de recuperar el recibo de una operación `sending` o reintentada. Si el servidor completó la mutación y la respuesta se perdió, abrir la app tras el plazo marca la operación como expirada sin reconciliar el resultado.

**Evidencia:** se reprodujo con una operación `sending` vencida y un cliente de prueba capaz de devolver un recibo exitoso. El resultado fue `expired: 1` y cero consultas de recibo.

**Impacto:** el estado local contradice al servidor y la persona puede creer que un cambio confirmado nunca se ejecutó.

**Corrección:** distinguir el vencimiento para nuevos envíos de la recuperación de operaciones cuyo resultado es incierto. Consultar el recibo antes de declarar caducada una operación previamente enviada.

## 8. P1 — Descarga incremental implementada como respuesta vacía

**Referencia:** [offline.controller.ts:84](services/api/src/businesses/offline.controller.ts#L84).

`GET /api/offline/changes` ignora usuario y cursor y devuelve siempre `items: []`, `nextCursor: null` y la hora del servidor. No entrega cambios ni bajas.

**Impacto:** el contrato puede hacer creer al cliente que está actualizado mientras conserva información obsoleta o retirada. La sincronización incremental prevista en el plan no está implementada.

**Corrección:** implementar el flujo por actor/organización, con versiones, bajas, cursores y recuperación de cursores vencidos. Hasta entonces, no presentar la respuesta vacía como una descarga completa válida.

**Validación:** comprobación directa de la implementación del endpoint.

## 9. P2 — Contrato incorrecto para crear sedes desde móvil

**Referencias:** [index.ts:568](services/mobile/src/index.ts#L568), [business.ts:160](packages/schemas/src/business.ts#L160), [business-profile.controller.ts:131](services/api/src/businesses/business-profile.controller.ts#L131).

El cliente envía `{ ...body, expectedVersion }`, pero el servidor exige `{ location, expectedVersion }`. También declara una respuesta de perfil, aunque el endpoint devuelve una sede.

**Evidencia:** una llamada local con contenido de sede válido produjo `ZodError` por ausencia de `location` y campos desconocidos, antes de realizar la petición.

**Impacto:** no se pueden crear sedes mediante este método; las operaciones offline de ese tipo tampoco pueden sincronizar correctamente.

**Corrección:** alinear cuerpo y respuesta con los contratos compartidos y comprobar el flujo usando el cliente real, sin sustituir el método por un mock.

## 10. P2 — Cerrar sesión elimina pendientes sin advertencia

**Referencia:** [App.tsx:501](services/mobile/App.tsx#L501).

El cierre de sesión borra inmediatamente los datos privados y la cola, sin consultar sus pendientes ni advertir de la pérdida.

**Impacto:** una persona puede perder ediciones guardadas offline al salir de su cuenta.

**Corrección:** informar de los cambios pendientes y solicitar confirmación antes de descartarlos; coordinar además el cierre con cualquier sincronización en curso.

**Validación:** inspección del manejador de cierre; pendiente prueba de interacción nativa.

## 11. P2 — Saturación de cola por operaciones ya sincronizadas

**Referencias:** [storage.ts:302](services/mobile/src/storage.ts#L302), [sync.ts:129](services/mobile/src/sync.ts#L129).

El límite de 100 se calcula con todos los elementos, mientras el sincronizador conserva las operaciones completadas. No existe compactación automática de ese historial.

**Impacto:** después de acumular 100 operaciones históricas se rechazan nuevas ediciones aunque no haya envíos pendientes.

**Corrección:** separar el historial de la cuota de pendientes o compactarlo preservando los recibos y las dependencias necesarias. Probar más de 100 operaciones completadas y una nueva edición.

**Validación:** inspección del cómputo de cuota y del tratamiento de estados terminales.

## 12. P2 — El botón móvil de reservar no inicia una reserva

**Referencia:** [App.tsx:941](services/mobile/App.tsx#L941).

El botón del negocio solo cambia a la pestaña de citas. No utiliza el calendario seleccionado ni `bookingUrl` para iniciar la reserva.

**Impacto:** se interrumpe el recorrido directorio → negocio → reserva.

**Corrección:** conectar el destino seleccionado con el flujo de reserva, conservándolo durante la autenticación y respetando el estado reservable del destino.

**Validación:** inspección del manejador del botón; pendiente recorrido nativo completo.

## Verificaciones realizadas

- `pnpm --filter @mcet/api test`: 14 archivos y 189 pruebas aprobadas.
- `pnpm exec vitest run --config tests/unit/vitest.config.js tests/unit/mobile-offline.test.js tests/unit/mobile-app.test.js`: 2 archivos y 21 pruebas aprobadas.
- `npm run typecheck` en `services/mobile`: aprobado.
- `pnpm --filter @mcet/admin build`: aprobado; utilizado para la reproducción local de autenticación administrativa.
- `git diff --check`: aprobado durante la revisión.
- Reproducciones locales: aceptación de identidad Google falsificada y vencida; acceso administrativo con configuración predeterminada; caducidad sin recuperación de recibo; rechazo del contrato móvil de sedes.

Las pruebas aprobadas no invalidan estos hallazgos. La cobertura actual incluso considera válido un JWT con firma ficticia en las pruebas de Google. No se ejecutaron pruebas de explotación en producción, E2E integradas con base real ni validación en dispositivos Android/iOS durante esta revisión.

## Orden de corrección recomendado

1. Cerrar la suplantación de Google y eliminar las credenciales administrativas predeterminadas; revisar sesiones y credenciales existentes según la exposición real.
2. Unificar suspensión administrativa, permisos, facturación y propagación al motor; aplicar límites de autenticación efectivos.
3. Corregir conectividad, reconciliación, descarga incremental y contratos móviles.
4. Proteger los pendientes al salir, compactar la cola y completar el recorrido móvil de reserva.
5. Añadir regresiones que reproduzcan cada fallo y ejecutar las verificaciones integradas y nativas correspondientes.

## Plan de ejecución para un modelo pequeño y económico

Este plan corrige los doce hallazgos anteriores. No autoriza desplegar, fusionar, rotar secretos de producción ni borrar sesiones reales. Las tareas de implementación pueden ejecutarse de forma secuencial; las operaciones sobre producción necesitan su autorización correspondiente. La revisión del código y las reproducciones son la base del plan, no una afirmación de que ya se haya corregido algo.

### Forma de trabajar y controlar el coste

1. Ejecutar **una tarea identificada por sesión**. Cargar este apartado, el hallazgo relacionado, `AGENTS.md` y los archivos de entrada de esa tarea. Seguir imports relevantes cuando sea necesario; evitar releer todo el repositorio.
2. Antes de editar, comprobar `git status --short --branch` y el diff de los archivos afectados. Ya existen cambios móviles sin commit y un relevo de seguridad ajeno al plan: no descartarlos ni asumir que pertenecen a la tarea nueva.
3. Reproducir el caso negativo con una prueba de comportamiento. Corregir la causa mínima. Para defectos de seguridad, conservar también una prueba del flujo legítimo.
4. No actualizar dependencias ni regenerar lockfiles sin necesidad autorizada. `jose` ya está declarado en la API; Expo y las librerías de persistencia ya están declaradas en móvil. Verificar las versiones y APIs instaladas antes de usarlas.
5. Procurar cambios de 2–5 archivos de producción más sus pruebas. Si hacen falta varias capas, dividir en las subtareas indicadas. El número de archivos es orientativo: no omitir traducciones, migraciones o contratos para cumplirlo.
6. Ejecutar primero las pruebas de la tarea. Ejecutar la batería completa en los puntos de integración indicados, sin repetirla después de cada edición trivial.
7. No usar mocks del método que contiene el defecto: simular únicamente fronteras como Google, reloj, red o almacenamiento. No sustituir la verificación criptográfica por un mock que siempre devuelve éxito.
8. Si cambia texto visible, entregar los seis idiomas y accesibilidad en esa misma tarea. Extraer módulos pequeños de `App.tsx` cuando la tarea lo justifique; no rediseñar toda la app.
9. No modificar el significado de un contrato público para hacer pasar una prueba. Si el contrato resulta ambiguo, describir la ambigüedad y la decisión necesaria antes de implementar la parte dependiente; continuar con las tareas independientes autorizadas.
10. Registrar comandos, resultados y limitaciones en el seguimiento al final. No marcar una tarea completa con verificaciones obligatorias pendientes; usar `implementada, validación pendiente` cuando corresponda.

### Estados y entrega de cada sesión

Estados permitidos: `pendiente`, `en curso`, `implementada, validación pendiente`, `verificada`, `bloqueada`.

Al terminar una tarea, añadir una fila al registro con: ID, estado, archivos, prueba del defecto, comandos y resultados, limitación y siguiente ID ejecutable. Si hay commits, incluir el SHA real. Una prueba omitida debe llevar su motivo y el comando exacto para ejecutarla; no contar la disponibilidad de un comando como una ejecución aprobada.

### Comandos de referencia comprobados en el repositorio

Ejecutar desde la raíz salvo indicación contraria. Elegir los que correspondan al cambio.

| Código | Comando | Uso |
|---|---|---|
| A1 | `pnpm --filter @mcet/api exec vitest run test/mobile.test.ts test/google-customer.test.ts` | Autenticación Google |
| A2 | `pnpm --filter @mcet/api test` | Unitarias completas de API |
| A3 | `pnpm --filter @mcet/api typecheck` | Tipos de API |
| D1 | `pnpm --filter @mcet/admin test` | Administración |
| D2 | `pnpm --filter @mcet/admin typecheck` | Tipos de administración |
| M1 | `pnpm exec vitest run --config tests/unit/vitest.config.js tests/unit/mobile-offline.test.js tests/unit/mobile-app.test.js` | Lógica móvil y cliente |
| M2 | `npm --prefix services/mobile run typecheck` | Tipos de la app móvil completa |
| Q1 | `pnpm exec biome check <archivos modificados>` | Calidad; sustituir el marcador por rutas reales |
| Q2 | `git diff --check` | Integridad del diff |
| L1 | `pnpm i18n:check` | Paridad de catálogos |
| B1 | `pnpm test:db` | Pruebas con PostgreSQL y motor; requiere entorno de pruebas |
| B2 | `pnpm test:backend` | Integración backend y Gherkin |
| N1 | `pnpm test:native:mobile` | Android/iOS y tabletas; requiere binarios, dispositivos y Appium |

**Advertencia operativa comprobada:** `services/mobile` está fuera de `pnpm-workspace.yaml`. `pnpm --filter @mcet/mobile typecheck` puede informar «No projects matched» sin verificar nada. Usar M2. El script `test` del paquete móvil tampoco sustituye M1: no incluye por sí solo la suite offline. Inspeccionar la configuración del runner antes de añadir pruebas nuevas para asegurar que realmente las descubre.

### Decisiones de implementación que fijan el alcance

- Google: verificar tokens del cliente con una librería mantenida, claves de Google y algoritmos permitidos explícitos. En pruebas, usar pares de claves y JWKS locales. Ningún `TEST_MODE` debe admitir firmas ficticias en una prueba que pretenda representar producción. Mantener el flujo OAuth por código y el contrato público vigente.
- Administración: ningún secreto con valor predeterminado. SQLite puede conservar historial administrativo, pero el bloqueo efectivo debe vivir en la base compartida que consulta la API.
- Bloqueo y facturación: mantener separados ambos conceptos. **Desbloquear no concede `active`.** La restricción administrativa domina el permiso efectivo, pero un webhook de Stripe puede actualizar el estado económico sin levantar esa restricción. Al retirarla se recupera el estado económico vigente.
- Propagación: reutilizar `calendarStatusPending` y el reconciliador existente. La decisión efectiva se vuelve a calcular al propagar; no enviar ciegamente un estado capturado antes de un cambio concurrente.
- Móvil: distinguir «no enviar después del plazo» de «resultado desconocido de una operación enviada». El plazo de envío no impide recuperar un recibo todavía retenido por el servidor.
- Historial local: las operaciones confirmadas no consumen indefinidamente la cuota de pendientes; tampoco se pueden eliminar si con ello se rompe una dependencia no resuelta.
- Descarga incremental: no adoptar un cursor basado únicamente en una secuencia sin resolver el orden de commit. Contrato, partición, bajas y retención se diseñan y prueban antes del endpoint.
- Reservas: confirmar únicamente mediante la respuesta del servidor. El destino de reserva debe conservarse al autenticar; los enlaces deben validarse contra los dominios y rutas del proyecto.

### Asignación de modelos y punto de inicio

Todas las tareas usan esfuerzo **High**. Esta asignación es una recomendación para este proyecto, basada en su riesgo y dependencias; no garantiza que una tarea se resuelva sin revisión. Luna implementa cambios acotados con aceptación definida. Sol resuelve autenticación, autorización, decisiones de arquitectura, concurrencia delicada y revisiones de integración.

**Inicio recomendado: S01 con GPT-6.1 Sol en High**, seguido de S02. Después cambiar a GPT-6 Luna en High para S03 y regresar a Sol para S04–S08 e I01. Así se priorizan los dos hallazgos críticos antes del resto.

**Si vas a empezar una sesión directamente con Luna:** la primera tarea independiente es **M01**; también puede ejecutar S03, que no depende técnicamente de S01–S02. Esto no cierra ni reduce la prioridad de la vulnerabilidad Google pendiente. No ejecutar una tarea de Sol con Luna solo por avanzar en la lista.

El documento no cambia automáticamente el modelo de Codex. Seleccionar el modelo y High antes de iniciar cada sesión. Al cambiar de modelo, entregar la tarea anterior con sus pruebas y estado actualizado; no lanzar agentes ni sesiones paralelas por este plan.

| Bloque | Modelo | Esfuerzo | Tareas en orden | Condición de entrada |
|---|---|---|---|---|
| 1 | GPT-6.1 Sol | High | S01 → S02 | Ninguna |
| 2 | GPT-6 Luna | High | S03 | Priorizar después del bloque 1 |
| 3 | GPT-6.1 Sol | High | S04 → S05 → S06 → S07 → S08 → I01 | S03; respetar contratos y validaciones |
| 4 | GPT-6 Luna | High | M01 → M02 | Ninguna; preferentemente después de seguridad |
| 5 | GPT-6.1 Sol | High | M03 | M02 |
| 6 | GPT-6 Luna | High | M04 | M03 |
| 7 | GPT-6.1 Sol | High | M05 | M03–M04 |
| 8 | GPT-6 Luna | High | M06 | M05 |
| 9 | GPT-6.1 Sol | High | C01 → C02a → C02b | I01 y M03 |
| 10 | GPT-6 Luna | High | C03 → R01 | C02a–C02b para C03; M02 para R01 |
| 11 | GPT-6.1 Sol | High | R02 → V01 | R01 para R02; todas las tareas para V01 |

**Puntos de revisión por Sol:** I01 revisa las correcciones de seguridad, incluida S03 de Luna. M03 revisa la integración de conectividad de M02. M05 comprueba que la compactación de M04 conserva las garantías de concurrencia. V01 revisa el conjunto móvil y la aplicación transaccional de C03. Si Luna encuentra un contrato ambiguo o falla repetidamente con una causa que no consigue aislar, debe dejar reproducción y diff concreto para Sol; no aumentar esfuerzo a Max ni ampliar alcance automáticamente.

### Secuencia y dependencias

Orden preferente: **S01 → S02 → S03 → S04 → S05 → S06 → S07 → S08 → I01 → M01 → M02 → M03 → M04 → M05 → M06 → C01 → C02a → C02b → C03 → R01 → R02 → V01**.

S01–S02 cierran el hallazgo 1; S03 cierra el 2; S04–S07 resuelven conjuntamente 3–4; S08 resuelve 5. M01–M06 abordan 6, 7, 9, 10 y 11. C01–C03 resuelven 8. R01–R02 resuelven 12. V01 integra evidencia. Ninguna tarea posterior cierra una anterior por el mero hecho de depender de ella.

#### S01 — Verificador criptográfico de identidad Google

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 1. **Depende de:** ninguna.

**Entradas:** `services/api/src/public-booking/google-customer.ts`, `services/api/src/mcp/token-verifier.ts` como referencia de uso de `jose`, configuración de Google y pruebas `google-customer.test.ts` / `mobile.test.ts`.

**Cambio acotado:** crear un verificador asíncrono para tokens recibidos del cliente. Verificar firma, algoritmo, emisor, audiencia y caducidad obligatoria; comprobar correo verificado y tipos de claims. Comprobar `nonce` si el flujo lo exige. Obtener las claves de una URL oficial fija, con caché y tiempo de espera; no usar URLs de `jku`/`x5u` proporcionadas por el token. Permitir inyectar un resolvedor de claves para pruebas sin convertirlo en un bypass accesible desde una petición.

**Aceptación:** firma inventada, `alg: none`, token vencido o sin `exp`, audiencia/emisor incorrectos y correo no verificado se rechazan. Un token firmado por la clave de prueba esperada se acepta. Un fallo de descarga de claves falla de forma cerrada y recuperable, sin crear sesión. Las pruebas no necesitan internet.

**Verificar:** pruebas específicas del nuevo verificador, A3, Q1–Q2. Entregar el módulo antes de cambiar ambos controladores.

#### S02 — Integrar el verificador en ambas entradas de Google

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 1. **Depende de:** S01.

**Entradas:** `google-customer.ts`, `mobile/mobile.controller.ts`, `public-booking/public-booking.controller.ts` y las dos suites Google.

**Cambio acotado:** conectar el verificador con `resolveGoogleMobileIdentity`, mantener el canje de código OAuth y garantizar que `customerSessionFor` solo se llama después de una identidad válida. Revisar el canje de código para validar sus claims temporales y de audiencia. Sustituir las expectativas actuales que aceptan `firma` por casos criptográficamente válidos e inválidos.

**Aceptación:** ambos endpoints rechazan la reproducción del informe y no invocan creación de sesión; Google legítimo por token y por código continúa funcionando; errores no revelan tokens ni detalles internos.

**Verificar:** A1–A3, Q1–Q2. Cerrar hallazgo 1 solo con las dos entradas cubiertas.

#### S03 — Eliminar credenciales administrativas de respaldo

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 2. **Depende de:** ninguna; ejecutar inmediatamente después de S02.

**Entradas:** `services/admin/src/config.ts`, `db/admin-db.ts`, `test/admin.test.ts`, `compose.prod.yml`, `compose.yml`, `compose.ci.yml`, `README.md` y plantillas de entorno aplicables.

**Cambio acotado:** exigir credenciales iniciales explícitas según el ciclo real de inicialización; validar antes de arrancar. Propagarlas desde compose sin escribir valores reales en el repositorio. Las pruebas pasan credenciales efímeras explícitas. Documentar cómo cambiar la cuenta ya existente: cambiar una variable no debe presentarse como rotación de su hash en SQLite.

**Aceptación:** instalación vacía sin configuración no arranca; con configuración crea cuenta y permite login; contraseña distinta falla; reiniciar no sobrescribe una cuenta existente. El compose productivo exige la configuración. Documentar rotación y revocación de sesiones existentes como acción operativa pendiente de autorización.

**Verificar:** D1–D2, Q1–Q2 y validación de compose con variables ficticias, sin imprimir secretos. No borrar el volumen para probar una migración.

#### S04 — Congelar el contrato de bloqueo compartido

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgos:** 3–4. **Depende de:** S03.

**Entradas:** `services/admin/src/db/platform-db.ts`, `api.routes.ts`, API `auth/auth.registry.ts`, `auth/auth.factory.ts`, `auth/org-access.ts`, `billing/billing.service.ts`, `mcp/mcp.service.ts` y esquema de usuarios/organizaciones.

**Entrega de diseño:** añadir una nota breve a este documento, con tabla de estados y lista de consumidores. Propuesta mínima: restricción persistente por usuario en PostgreSQL; `organizations.status` conserva el estado económico; la suspensión efectiva se deriva de la restricción del propietario. Identificar lecturas públicas, escrituras, cookies, Bearer, Google y MCP que deben aplicarla. Fijar códigos de error y quién escribe/audita la restricción. Inventariar las suspensiones antiguas: si no se puede conocer su causa, conservar la denegación hasta reconciliación explícita.

**Aceptación:** describir los resultados de bloquear/desbloquear una cuenta `trialing`, `active`, `past_due`, `read_only` y ya suspendida, incluyendo un cambio de Stripe durante el bloqueo. Definir transacción y recuperación con el motor caído. No crear un segundo estado económico independiente sin justificar su reconciliación. Si la propuesta contradice un contrato existente, registrar el conflicto concreto antes de S05.

**Verificar:** revisión técnica del diseño y de la matriz; esta tarea no requiere migrar ni modificar autenticación. No declararla como corrección de los hallazgos.

##### Contrato congelado para S05–S06

**Fuente de verdad y estados.** PostgreSQL tendrá una fila activa por usuario en `app.user_restrictions` (clave `user_id` con FK a `app.users`, motivo, fecha, actor administrativo y `reconciliation_required`). La escribe el endpoint administrativo de bloqueo/desbloqueo mediante `PlatformDatabase`. La transacción también registra la acción en `app.audit_log` (`via='panel'`, destino = usuario, `actorUserId=NULL`, username administrativo y motivo en `metadata`) y marca `calendar_status_pending` en todas las organizaciones vivas afectadas. La restricción de PostgreSQL es la autoridad; `admin_blocked_users` de SQLite deja de decidir el acceso. `admin_audit_logs` conserva el historial visible del panel como registro separado, sin fingir una transacción entre SQLite y PostgreSQL.

En una organización no borrada, `organizations.status` representa la situación económica (`trialing`, `active`, `past_due`, `read_only`). El estado efectivo que se proyecta al motor es `suspended` si el propietario tiene una restricción; en otro caso es el estado económico. Una restricción de un miembro que no es propietario bloquea a esa cuenta, pero no suspende el negocio ni afecta a los otros miembros. Bloquear al propietario suspende las escrituras y las reservas públicas del negocio para todos; quienes no están bloqueados conservan las lecturas privadas permitidas por la matriz existente. Un negocio con `deleted_at` sigue siendo un tombstone y no se restaura al desbloquear al propietario.

| Estado económico al bloquear | Mientras está bloqueado | Al desbloquear |
|---|---|---|
| `trialing` | Se conserva `trialing`; estado efectivo `suspended` | Vuelve a `trialing` |
| `active` | Se conserva `active`; estado efectivo `suspended` | Vuelve a `active` |
| `past_due` | Se conserva `past_due`; estado efectivo `suspended` | Vuelve a `past_due` |
| `read_only` | Se conserva `read_only`; estado efectivo `suspended` | Vuelve a `read_only`; nunca se fuerza `active` |
| Restricción ya activa | Bloqueo idempotente: no cambia motivo ni fecha original | Se elimina la restricción y se deriva el estado actual; si `reconciliation_required=true`, se rechaza el desbloqueo hasta reconciliar |
| `suspended` persistido en una organización viva sin restricción identificable | Se mantiene denegado y se crea/marca la restricción con `reconciliation_required=true`; no se presume el estado económico anterior | `409 restriction_reconciliation_required`; no se elimina la restricción ni se escribe `active` hasta reconciliar causa y estado económico |

Si llega un webhook o cambio de Stripe mientras la cuenta está bloqueada, se guarda el nuevo estado económico y los datos de facturación, se conserva la restricción y se marca la proyección pendiente. El estado efectivo sigue siendo `suspended`. Al desbloquear, se deriva del estado económico más reciente. Stripe nunca crea ni elimina una restricción administrativa.

**Ejecución, errores y recuperación.** S05: una transacción PostgreSQL inserta/elimina la restricción, revoca sesiones de Better Auth y tokens de acceso/renovación MCP que correspondan, escribe auditoría y marca las organizaciones vivas afectadas con `calendar_status_pending=true`. Si PostgreSQL falla, no se informa éxito. Cuando la cuenta es propietaria de una organización pendiente, el endpoint devuelve `202 Accepted` con `calendarStatusPending=true`; si no hay una proyección pendiente, devuelve `200`. Este `202` confirma persistencia, no que el motor ya haya cambiado. S07 es dueño de enviar `SetOrgStatus` con el estado efectivo, serializar por organización (`FOR UPDATE`), dejar el indicador activo si falla el RPC y reintentar mediante el reconciliador. No se promete rollback entre servicios. S06 debe hacer que las mutaciones y reservas públicas afectadas fallen cerradas mientras haya una proyección pendiente.

Respuestas acordadas: usuario inexistente, `404 user_not_found`; fallo de PostgreSQL antes del commit, `503 platform_unavailable`; cambio persistido con proyección pendiente, `202 Accepted` con `calendarStatusPending=true`; desbloqueo legacy no conciliado, `409 restriction_reconciliation_required`. S07 mantiene el indicador hasta que el motor confirme. Una sesión o credencial restringida/revocada recibe `401 unauthenticated` genérico, igual que una sesión no válida, sin revelar existencia ni motivo. Una restricción de propietario que afecte a otro miembro devuelve `403 org_suspended` al intentar escribir; el estado económico `read_only` conserva `403 org_read_only`. Las lecturas/consultas públicas de calendarios suspendidos conservan el `404 calendar_not_found` actual; un perfil `read_only` sigue visible con `bookable=false` y la reserva se rechaza con `409 calendar_unavailable`. MCP no ejecuta herramientas y responde `401 invalid_token` para una cuenta restringida. El mismo control se aplica antes de emitir nuevas sesiones: cookie, Bearer de Better Auth, OTP, Google (incluido `customerSessionFor`) y OAuth/MCP.

**Consumidores obligatorios:** (1) `services/admin/src/routes/api.routes.ts` y `db/platform-db.ts`, únicos escritores administrativos y fuente del motivo/actor; (2) `AuthRegistry.session`, `SessionGuard`, `AuthFactory` y los flujos directos de OTP/Google, para cookies, Bearer y creación de sesión; (3) `org-access.ts`, `CalendarAccess`, `CalendarsService`, `MembersService`, `BusinessProfileService` y rutas de negocio, para lecturas y mutaciones privadas; (4) `PublicBookingController` y los RPC de disponibilidad/holds/reservas, para ocultar calendarios suspendidos y cerrar escrituras durante la reconciliación; (5) `BillingService.setStatus`, webhooks y `syncCalendarStatus`, para preservar el estado económico y proyectar el efectivo; (6) `/mcp`, `McpService.caller` y emisión OAuth, que usan tokens separados de las sesiones Better Auth; (7) `services/calendar/internal/engine` y su tabla `org_status`, proyección consumidora que ya rechaza escrituras/reservas en `suspended` y `read_only`, nunca fuente de verdad.

**Datos legacy y conflictos concretos:** el código actual guarda `suspended` directamente en `organizations.status`; el desbloqueo antiguo lo cambia a `active`. `BillingService` no produce `suspended` desde Stripe, pero `closeOrg` lo conserva junto con `deleted_at`. Las filas vivas `status='suspended'` no contienen causa ni estado económico previo. El backfill debe crear una restricción para los propietarios de esas filas y mantenerlos denegados hasta confirmar estado/causa; las filas con `deleted_at` siguen como tombstones y no originan por sí solas una restricción. Toda fila de `admin_blocked_users` de SQLite también se migra por `user_id`; IDs inexistentes se reportan para revisión y nunca se usan para activar cuentas. No se inspeccionaron datos de producción, así que el inventario fila por fila sigue pendiente de S05/despliegue.

Conflictos resolubles antes de implementar: el esquema Drizzle y el motor aceptan `suspended` como estado almacenado, aunque el nuevo contrato lo deriva para organizaciones vivas; el contrato conserva `suspended` en el RPC/tabla `org_status`, pero deja de escribirlo como estado económico. `BillingService.syncCalendarStatus` actualmente envía `org.status` sin consultar la restricción y debe pasar a proyectar el efectivo. La lista activa del panel hoy se deriva de SQLite; debe leerse de PostgreSQL y SQLite queda como historial. Los logins Google del cliente final y el MCP tienen rutas de sesión/token propias, así que proteger solo `SessionGuard` no basta.

#### S05 — Persistencia y escritura administrativa del bloqueo

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgos:** 3–4. **Depende de:** contrato de S04 resuelto.

**Entradas:** esquema y nuevas migraciones de API, `services/admin/src/db/platform-db.ts`, rutas de bloqueo/desbloqueo y pruebas de administración/DB.

**Cambio acotado:** implementar la restricción compartida acordada. En una transacción, escribir/quitar la restricción, revocar las sesiones que procedan y marcar las organizaciones afectadas para reconciliación. El desbloqueo no escribe `status = 'active'`. PostgreSQL es la fuente de verdad; SQLite conserva historial sin aparentar que ambas bases forman una sola transacción. Quitar los `catch` que convierten fallos de seguridad en éxito.

**Aceptación:** bloquear/desbloquear dos veces es seguro; usuario inexistente tiene respuesta definida; fallo de PostgreSQL devuelve error y no informa éxito; un negocio `read_only` continúa con ese estado tras desbloquear. Migración desde base vacía y anterior sin perder datos, con tratamiento explícito de restricciones nuevas sobre datos existentes.

**Verificar:** D1–D2, B1 con las pruebas afectadas, Q1–Q2. Sin PostgreSQL disponible, implementar pruebas locales y registrar B1 pendiente; no cerrar S05 como verificada.

#### S06 — Hacer efectivo el bloqueo en autenticación y permisos

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 3. **Depende de:** S05.

**Entradas:** `auth.registry.ts`, `auth.factory.ts`, `google-customer.ts`, `mcp/mcp.service.ts`, capa común de acceso a organizaciones y consumidores identificados en S04.

**Cambio acotado:** consultar la restricción compartida antes de aceptar una identidad/sesión o ejecutar una operación protegida. Cubrir las rutas que crean sesiones directamente y las credenciales MCP ya emitidas. Aplicar el estado efectivo en la autorización común y lecturas públicas afectadas. No confiar exclusivamente en borrar las sesiones existentes.

**Aceptación:** cuenta bloqueada no obtiene ni utiliza acceso por contraseña, Google, cookie, Bearer o MCP; cuentas ajenas siguen funcionando; el bloqueo de un colaborador no suspende por accidente una organización de otro propietario. Errores de la consulta de seguridad no conceden acceso.

**Verificar:** A2–A3 y regresiones de seguridad reales en B2; Q1–Q2. Si el tamaño supera una sesión, dividir en S06a autenticación y S06b permisos/MCP, manteniendo esta matriz completa.

#### S07 — Propagar el estado efectivo y conservar facturación

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgos:** 3–4. **Depende de:** S05–S06.

**Entradas:** `billing.service.ts`, reconciliador, lecturas públicas de negocios y pruebas API/Go relacionadas con estado de organización.

**Cambio acotado:** calcular el estado efectivo al sincronizar con el motor, bajo el bloqueo/transacción correspondiente. Mantener `calendarStatusPending` si falla RPC. Un webhook actualiza el estado económico sin quitar una restricción administrativa. Desbloquear vuelve a proyectar el estado económico vigente, sin reactivar organizaciones cerradas.

**Aceptación:** motor caído → bloqueo persistido → reintento → reservas denegadas; dos cambios concurrentes no dejan aplicado el antiguo; webhook durante bloqueo mantiene la suspensión efectiva; desbloquear una organización impagada conserva las restricciones de pago.

**Verificar:** pruebas de estado en A2, B1–B2 y pruebas Go relacionadas; Q1–Q2. No ejecutar BDD concurrentes contra la misma instancia de pruebas.

#### S08 — Límites efectivos en autenticación móvil

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 5. **Depende de:** S02; integrar después de S07 para evitar cambios simultáneos en autenticación.

**Entradas:** `mobile.controller.ts`, configuración de límites en `auth.factory.ts`, almacenamiento de rate limits existente y gateway.

**Cambio acotado:** reutilizar un limitador persistente mantenido ya disponible o el manejador HTTP de Better Auth. Elegir y documentar una sola vía después de verificar su API instalada. Conservar los umbrales existentes por endpoint y cubrir claves por IP real y cuenta normalizada sin revelar su existencia. Evitar contadores ilimitados en memoria, confiar en cabeceras del cliente o duplicar el contador al atravesar dos manejadores.

**Aceptación:** superar el límite de login/registro/recuperación devuelve 429 y `Retry-After`; variar IP no elimina el límite de cuenta; variar cuenta no elimina el límite de IP; tras la ventana vuelve a permitir; los errores no enumeran cuentas. Ejecutar la prueba con límites habilitados, sin depender de `TEST_MODE` que los desactiva.

**Verificar:** nuevas pruebas de integración del limitador y ambos caminos de autenticación, A2–A3, Q1–Q2. Si la API instalada obliga a otra dependencia, registrar la necesidad antes de instalarla.

#### I01 — Integración de las correcciones de seguridad

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Depende de:** S01–S08.

**Entrega:** ejecutar las pruebas integradas de suplantación, cuenta inicial, bloqueo, suscripción y límites; revisar diffs, migraciones y configuración. A2–A3, D1–D2, B1–B2, L1 cuando haya textos y Q1–Q2.

**Aceptación:** cada hallazgo 1–5 tiene una regresión ejecutada, la vía de acceso legítima está probada y no quedan éxitos aparentes ante dependencias caídas. Registrar por separado la rotación/revocación operativa no ejecutada. No desplegar como parte de esta tarea.

#### M01 — Alinear contratos de sedes del cliente móvil

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 9. **Depende de:** ninguna; comenzar el bloque móvil aquí por ser una corrección aislada.

**Entradas:** `services/mobile/src/index.ts`, contratos `business.ts`, controlador privado y `tests/unit/mobile-app.test.js`.

**Cambio acotado:** enviar `{ location, expectedVersion }` en creación; declarar el tipo de sede real en la respuesta. Revisar los métodos vecinos de modificación/borrado/asignación para no repetir el mismo defecto, especialmente cuerpo e `Idempotency-Key` obligatorios, sin añadir operaciones nuevas.

**Aceptación:** el cliente real genera el cuerpo y cabeceras exigidos, recibe una sede tipada y rechaza entradas inválidas; la llamada no falla antes del `fetch` con datos válidos. Prueba de contrato contra la API cuando el entorno esté disponible.

**Verificar:** M1–M2, Q1–Q2; A2 si se toca servidor, lo que no debería ser necesario para adaptar el cliente.

#### M02 — Conectividad y plazos de petición

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 6. **Depende de:** M01.

**Entradas:** `App.tsx`, cliente `src/index.ts`, efecto de reconexión y pruebas móviles.

**Cambio acotado:** extraer un controlador pequeño del estado de conexión, con timeout y cancelación de solicitudes. Distinguir errores de transporte/timeout/indisponibilidad de 401, 403, 409 y validación. Comprobar recuperación con el servidor, al volver a primer plano y mediante reintento, sin bucles concurrentes.

**Aceptación:** arrancar conectado, perder red, guardar y recuperar red funciona; 401 no se interpreta como falta de internet; red local sin salida y API caída tienen comportamiento definido; desmontar la pantalla no aplica respuestas antiguas. No reenviar automáticamente una mutación de resultado incierto sin idempotencia/reconciliación.

**Verificar:** pruebas con reloj y transporte controlados, M1–M2, L1 si hay mensajes, Q1–Q2. N1 queda para V01.

#### M03 — Recuperar resultados inciertos antes de caducar

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 7. **Depende de:** M02.

**Entradas:** `sync.ts`, contrato/endpoint de recibos y `mobile-offline.test.js`.

**Cambio acotado:** tratar una operación `sending` o reintentada como resultado incierto. Consultar su recibo aunque haya vencido el plazo de envío. Un recibo exitoso marca sincronizada; un 404 después de vencer no permite enviar de nuevo; 401 pausa; fallo de red conserva la incertidumbre. Definir el tratamiento de 410 y recibos con error sin convertirlos en éxito.

**Aceptación:** timeout tras commit + reapertura después de 24 h recupera éxito sin reenviar; 404 vencido no muta; caída al consultar recibo no descarta datos; dentro del plazo se conserva la clave original al reintentar. Comprobar qué operaciones tienen recibo durable real: no asumir que enviar `Idempotency-Key` implica que el servidor lo almacena. Si cancelación carece de recibo, registrar y resolver esa subdependencia antes de declarar cubierta la cancelación.

**Verificar:** M1–M2, pruebas API/DB de recibos cuando se modifiquen, Q1–Q2.

#### M04 — Cuota y compactación segura de historial

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 11. **Depende de:** M03.

**Entradas:** `storage.ts`, `sync.ts`, límites compartidos y pruebas offline.

**Cambio acotado:** distinguir cuota de pendientes del historial terminal. Compactar únicamente estados que no hagan falta para resolver dependencias; no eliminar `sending`, conflictos, errores o borradores para liberar espacio. Mantener la cota total de bytes y una política acotada de retención. Aplicar el cambio de cola de forma atómica en el almacenamiento utilizado.

**Aceptación:** más de 100 operaciones completadas permiten una nueva; 100 pendientes siguen bloqueando otra; dependencia de una operación completada no se rompe tras compactar; fallo de escritura no pierde la cola previa; dos escrituras simultáneas preservan ambas operaciones.

**Verificar:** M1–M2, Q1–Q2; reinicio y transacción nativa en V01.

#### M05 — Salida coordinada con sincronización

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 10, parte de concurrencia. **Depende de:** M03–M04.

**Entradas:** `sync.ts`, `storage.ts`, `App.tsx` y pruebas offline.

**Cambio acotado:** definir una barrera de salida por cuenta: impedir nuevos envíos, esperar o reconciliar los que ya están en vuelo y evitar que una tarea antigua vuelva a escribir datos después de la purga. El estado de otra cuenta no puede usar ni enviar operaciones anteriores. No prometer deshacer una mutación ya confirmada.

**Aceptación:** iniciar sincronización → solicitar salida → resolver respuesta tardía no recrea privados después de borrar; cambiar de cuenta no envía la cola anterior con el token nuevo; un fallo de red deja un resultado explícito y no un cierre falsamente exitoso.

**Verificar:** pruebas deterministas con promesas controladas, M1–M2, Q1–Q2. No añadir todavía el diálogo de interfaz.

#### M06 — Advertencia de pendientes al cerrar sesión

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 10, parte de interfaz. **Depende de:** M05.

**Entradas:** manejador de salida, componente/diálogo pequeño, catálogos de seis idiomas y pruebas de interacción existentes.

**Cambio acotado:** mostrar pendientes reales antes de borrar, con opciones de cancelar la salida o confirmar el descarte. Contar también estados no resueltos que hoy no aparecen en el contador. Usar la barrera de M05 al confirmar y presentar errores de almacenamiento/revocación sin exponer credenciales.

**Aceptación:** cancelar conserva sesión y cambios; confirmar borra privados sin afectar datos públicos u otra cuenta; cero pendientes permite salir directamente; fallo de purga no informa éxito; textos y controles accesibles existen en seis idiomas.

**Verificar:** pruebas del controlador y de interacción compatibles con las herramientas existentes, M1–M2, L1, Q1–Q2; N1 en V01. No introducir una nueva librería de UI/pruebas sin necesidad justificada y autorización aplicable.

#### C01 — Contrato y diseño del flujo incremental

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 8. **Depende de:** I01 y M03.

**Entradas:** `offline.controller.ts`, `packages/schemas/src/offline.ts`, OpenAPI, ADR 0019, plan offline y cambios/outbox existentes.

**Entrega de diseño:** identificar cómo se representan hoy cambios, versiones y bajas. Añadir al documento una tabla de recursos a sincronizar, permisos, campos mínimos, orden, retención y comportamiento ante cursor vencido. Definir un cursor opaco ligado al actor, organización y ámbito de consulta; no usar el estado del cliente como autorización. Resolver el orden entre transacciones concurrentes antes de fijar el algoritmo. Establecer aplicación atómica de datos y avance de cursor en móvil.

**Aceptación:** ejemplos de páginas inicial/intermedia/final, baja, pérdida de permisos, cursor de otra cuenta, cursor caducado y transacciones que confirman en distinto orden. Si un recurso aún no tiene soporte, queda explícito en capacidades/contrato; no representarlo como una sincronización vacía exitosa.

**Verificar:** coherencia de ADR, esquemas y ejemplos; revisión técnica del contrato antes de C02. No diseñar ni desplegar una infraestructura de mensajería nueva para resolver este hallazgo.

#### C02 — Persistencia y API de cambios reales

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 8. **Depende de:** C01 resuelto.

**Entradas:** repositorios/mutaciones de los recursos del contrato, migraciones nuevas, `offline.controller.ts`, esquemas y OpenAPI.

**Cambio acotado:** dividir obligatoriamente en C02a registro transaccional de cambios/bajas y C02b paginación/autorización del endpoint. Registrar cada cambio con su mutación, sin datos privados innecesarios. El servidor filtra por permisos vigentes y trata explícitamente cursor vencido. No iniciar C02b si C02a no garantiza la captura de todos los recursos declarados.

**Aceptación:** una modificación y una baja aparecen; rollback no publica cambios; paginación concurrente no pierde eventos; repetir cursor es seguro; cuenta B no lee cambios de A; una revocación no deja datos privados accesibles; un cursor inválido no devuelve 500 ni una lista vacía engañosa.

**Verificar:** `pnpm test:schemas`, A2–A3, B1–B2, Q1–Q2. Si se necesita cambiar un contrato publicado, conservar su compatibilidad o resolver la versión antes de implementar.

#### C03 — Aplicar cambios y bajas en el almacenamiento móvil

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 8. **Depende de:** C02a–C02b.

**Entradas:** cliente móvil, almacenamiento nativo, sincronizador y pruebas offline.

**Cambio acotado:** descargar páginas e incorporar datos, tombstones y cursor en una transacción. Ante cursor vencido, recuperar un snapshot autorizado sin perder borradores o pendientes inciertos. No sobrescribir una edición local no resuelta ni revivir un dato retirado con un pendiente antiguo.

**Aceptación:** interrupción a mitad de página no avanza cursor parcialmente; repetir página no duplica; retirada elimina caché correspondiente; snapshot de recuperación conserva borradores permitidos; datos de una cuenta no aparecen en otra. Validar cuota y fallos de disco.

**Verificar:** M1–M2 y pruebas de almacenamiento; B2 para contrato cliente/servidor; N1 en V01. Si la interfaz de almacenamiento actual no permite transacciones entre varias claves, ampliarla en una subtarea previa con pruebas; no simular atomicidad con escrituras independientes.

#### R01 — Conservar y validar el destino de reserva

**Modelo asignado:** GPT-6 Luna · **Esfuerzo:** High.

**Hallazgo:** 12. **Depende de:** M02.

**Entradas:** botón de reserva de `App.tsx`, tipos `BusinessBookingTarget`, rutas traducidas y flujo de reserva web/móvil existente.

**Cambio acotado:** extraer un estado de intención de reserva que guarde calendario/sede y destino elegido. Validar `bookingUrl` con los dominios y rutas configurados; rechazar esquemas o hosts ajenos. Conservar la intención durante el acceso sin guardar contraseña, OTP ni holds como si fueran vigentes.

**Aceptación:** elegir dos destinos distintos mantiene el correcto; cancelar acceso permite volver al negocio; un destino no reservable no inicia reserva; URL externa o mal formada no se abre. No mezclar esta intención con las citas ya confirmadas.

**Verificar:** pruebas unitarias del controlador real, M1–M2, L1 si cambia texto, Q1–Q2.

#### R02 — Ejecutar el recorrido de reserva con el destino elegido

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Hallazgo:** 12. **Depende de:** R01 y contrato de reserva inspeccionado.

**Cambio acotado:** conectar la intención con el flujo existente. Si la app carece de pantalla nativa de reserva, documentar y concretar primero el adaptador elegido: reutilizar la página del proyecto mediante el navegador seguro ya disponible o implementar el flujo nativo existente por pasos. No copiar de forma improvisada el motor de reserva ni trasladar tokens de sesión a una URL. Un adaptador web no equivale a completar reservas nativas offline.

**Aceptación:** directorio → negocio → calendario/sede → acceso si hace falta → disponibilidad actual → confirmación del servidor. Volver atrás conserva el destino; plaza ocupada muestra conflicto; sin conexión no presenta una reserva confirmada. El retorno desde navegador, si se usa, tiene destino validado y comportamiento probado.

**Verificar:** pruebas del cliente real y recorrido de integración con el servidor, M1–M2, L1, Q1–Q2; evidencia nativa en V01. No cerrar hallazgo 12 con una prueba que solo compruebe el cambio de pestaña.

#### V01 — Integración final y evidencia nativa

**Modelo asignado:** GPT-6.1 Sol · **Esfuerzo:** High.

**Depende de:** todas las tareas anteriores verificables en el entorno.

**Entrega:** revisar diffs y contratos finales; ejecutar lint, typecheck, catálogos, builds y pruebas de las capas modificadas. Ejecutar `pnpm test:all` y N1 con los prerrequisitos de sus suites disponibles. Android e iOS se ejecutan secuencialmente, incluyendo teléfono y tableta. Usar cuentas y servicios de prueba.

**Matriz mínima nativa:** abrir con red → descargar → cortar red → editar → matar proceso → reabrir → recuperar red → comprobar servidor; repetir con respuesta perdida tras commit, API caída, sesión vencida, cambios concurrentes, cursor vencido, baja, disco lleno y cambio de cuenta. Comprobar que el binario incorpora SQLCipher, que una compilación sin él rechaza guardar privados y que SQLite conserva los datos permitidos tras reiniciar.

**Aceptación:** cada hallazgo tiene una regresión ejecutada y evidencia acorde a su riesgo. No declarar móvil offline terminado con un `Map`, un adaptador simulado o Playwright emulado. Si faltan dispositivos, firma, servicios o permisos, registrar el caso exacto pendiente y entregar los arreglos comprobados sin inventar evidencia ni bloquear tareas independientes.

### Plantilla de instrucción para cada tarea

Seleccionar primero el modelo asignado en High. Copiar este bloque y sustituir el identificador y el modelo:

```text
Trabaja en la tarea <ID> del plan de Problemas-Criticos.md.
Modelo de esta sesión: <MODELO ASIGNADO>; esfuerzo: High.
Comprueba que esta tarea corresponde al modelo elegido y que sus dependencias están verificadas.
Si una dependencia solo está implementada y le falta validación obligatoria, no la des por aprobada.
Lee AGENTS.md, el hallazgo relacionado, sus dependencias y los archivos de entrada.
Comprueba Git antes de editar y conserva todos los cambios preexistentes.
Implementa solo el alcance de esa tarea y sus regresiones; no despliegues ni actualices dependencias por iniciativa propia.
Usa los contratos y versiones instaladas, mantén los seis idiomas si introduces texto.
Ejecuta las verificaciones indicadas y comprueba que el runner descubre las pruebas.
Si falta una decisión de contrato, documenta el punto preciso y no inventes una solución incompatible.
Actualiza la fila de seguimiento con evidencia real y entrega: cambio, prueba del defecto, resultado y siguiente tarea ejecutable.
```

### Registro de seguimiento

Todo el plan está pendiente al añadirse. Las verificaciones históricas del informe no cuentan como validación de correcciones futuras.

| Tarea | Modelo | Esfuerzo | Estado | Evidencia de corrección | Dependencias |
|---|---|---|---|---|---|
| S01 | GPT-6.1 Sol | High | verificada | Verificador aislado; 52 pruebas, typecheck API y Biome aprobados. Véase registro S01. | Ninguna |
| S02 | GPT-6.1 Sol | High | verificada | 270 pruebas API, typechecks API/BDD, 3 escenarios HTTP y 1 reserva web con Google aprobados. Véase registro S02. | S01 |
| S03 | GPT-6 Luna | High | verificada | Configuración explícita obligatoria; 10 pruebas admin; typecheck, Biome y Compose dev/prod+CI aprobados. Véase registro S03. | S02 completada |
| S04 | GPT-6.1 Sol | High | verificada | Contrato, matriz de estados, errores, consumidores y reconciliación legacy definidos en esta nota; sin cambios de runtime. | S03 |
| S05 | GPT-6.1 Sol | High | verificada | Restricción PostgreSQL transaccional e idempotente, backfill/importación legacy y 14 pruebas admin; typechecks, migraciones PostgreSQL y Compose aprobados. Véase registro S05. | Contrato S04 |
| S06 | GPT-6.1 Sol | High | verificada (unitaria/BD) | Restricción PostgreSQL consultada en sesión, Better Auth, Google, MCP/OAuth y estado efectivo de organización; 291 pruebas API, 69 de BD, typecheck y Biome aprobados. Véase registro S06. | S05 |
| S07 | GPT-6.1 Sol | High | verificada | Estado efectivo proyectado al motor desde `syncCalendarStatus` bajo `FOR UPDATE`; 4 pruebas con PostgreSQL real, Go engine/outbox y escenario `reloj` aprobados. Véase registro S07. | S05–S06 |
| S08 | GPT-6.1 Sol | High | verificada | Limitador atómico por IP y cuenta en los tres endpoints móviles; 8 pruebas con PostgreSQL real, límites activos. Véase registro S08. | S02; integrar tras S07 |
| I01 | GPT-6.1 Sol | High | verificada | Lint, typecheck, i18n, unitarias (303 API, 14 admin, 81 + móvil), 76 de BD, Go y 86 escenarios backend aprobados con imágenes reconstruidas. Véase registro I01. | S01–S08 |
| M01 | GPT-6 Luna | High | verificada | Cliente alineado con los esquemas del servidor; 5 pruebas de contrato con los Zod reales. Véase registro M01. | Ninguna |
| M02 | GPT-6 Luna | High | verificada (unitaria) | Plazos, clasificación de errores, controlador de conexión y guardado en línea/cola; 14 pruebas con reloj y transporte controlados. Falta prueba nativa (V01). Véase registro M02. | M01 |
| M03 | GPT-6.1 Sol | High | verificada (unitaria) | Reconciliación de resultados inciertos antes de caducar; 13 regresiones nuevas que fallan con el código anterior. La revisión del 2026-11-04 halló abierta la vía del guardado en línea, ya corregida. Véase registros M03 y Revisión. | M02 |
| M04 | GPT-6 Luna | High | verificada (unitaria) | Cuota separada del historial y compactación segura; 8 pruebas. Transacción corregida en la Revisión; falta reinicio en dispositivo (V01). Véase registros M04 y Revisión. | M03 |
| M05 | GPT-6.1 Sol | High | verificada (unitaria) | Barrera de salida por cuenta con drenaje de la sincronización, descarte de escrituras tardías y token ligado a la sincronización; 8 pruebas deterministas. Falta nativo (V01). Véase registro M05. | M03–M04 |
| M06 | GPT-6 Luna | High | verificada (unitaria) | Confirmación ante pendientes, contador de todos los estados no confirmados y textos en 6 idiomas; 7 pruebas. Falta interacción nativa (V01). Véase registro M06. | M05 |
| C01 | GPT-6.1 Sol | High | verificada | ADR 0020 con recursos, permisos, orden por `xid8`, cursor firmado, retención y ejemplos. Véase registro C01. | I01, M03 |
| C02a | GPT-6.1 Sol | High | verificada | Migración 0014: `app.sync_changes` y triggers transaccionales; 4 pruebas con PostgreSQL real. Véase registro C02. | Contrato C01 |
| C02b | GPT-6.1 Sol | High | verificada | Endpoint paginado con snapshot, cursor firmado y autorización por página; 12 pruebas con PostgreSQL real. Véase registro C02. | C02a |
| C03 | GPT-6 Luna | High | verificada (unitaria + contrato HTTP) | Aplicación atómica de páginas, bajas y cursor en el móvil con transacción multi-clave; 13 pruebas y 2 escenarios contra la API real. Transacción SQLCipher corregida en la Revisión; falta dispositivo (V01). Véase registros C03 y Revisión. | C02a–C02b |
| R01 | GPT-6 Luna | High | verificada (unitaria) | Intención de reserva validada contra el sitio configurado y las rutas del proyecto; 5 pruebas de validación. Véase registro R01–R02. | M02 |
| R02 | GPT-6.1 Sol | High | implementada, validación pendiente | Adaptador de navegador seguro con reconciliación por el servidor; 9 pruebas. Falta el recorrido nativo y una cuenta de prueba (V01). Véase registro R01–R02. | R01, contrato de reserva |
| V01 | GPT-6.1 Sol | High | bloqueada (parte nativa) | Integración verificada en todo lo ejecutable aquí; faltan Appium, binarios nativos con SQLCipher y dispositivos. Véase registro V01. | Integración de todas las anteriores |

### Registro de ejecución — S01 (2026-11-03)

**Estado al terminar S01:** verificada como módulo aislado. La integración quedaba pendiente para S02; consultar su registro posterior para el estado vigente del hallazgo 1.

**Archivos de esta tarea:**

- `services/api/src/public-booking/google-id-token.ts`: fábrica `createGoogleIdTokenVerifier(clientId, keys?)`, con `jose` 6.2.12 ya instalado, sin dependencias nuevas. Devuelve una identidad con `subject`, correo normalizado y nombre, o `null` ante un token inválido o claves inaccesibles. El resolvedor inyectable es exclusivo de código de confianza; no se obtiene de la petición.
- `services/api/test/google-id-token.test.ts`: 52 casos ejecutados con firmas RSA y JWKS locales. Las descargas se simulan en la frontera de red y la verificación criptográfica es real.
- `Problemas-Criticos.md`: actualización del seguimiento.

**Comportamiento verificado:** RS256 como único algoritmo; firma con clave confiable; emisores Google explícitos; audiencia del cliente configurado; presencia y tipos de `sub`, `iat`, `exp`, correo y verificación de correo; rechazo de caducidad y emisión futura; comprobación del nonce cuando el servidor proporciona uno esperado. Se acepta un solo `aud` y, si existe `azp`, debe coincidir con ese cliente. S02 debe respetar esta política y revisar la configuración de los flujos móviles antes de introducir clientes adicionales.

Las claves se consultan únicamente en `https://www.googleapis.com/oauth2/v3/certs`, sin seguir redirecciones ni URLs `jku`/`x5u` del token, con timeout de 5 segundos, caché de 10 minutos y cooldown de 30 segundos. Se probaron descargas concurrentes, expiración de caché, rotación de `kid`, respuestas inválidas, timeout y recuperación posterior. Los tests no requieren internet ni activan un modo que acepte firmas falsas.

**Verificaciones ejecutadas:**

- `pnpm --filter @mcet/api exec vitest run test/google-id-token.test.ts`: 1 archivo, 52 pruebas aprobadas.
- `pnpm --filter @mcet/api typecheck`: aprobado, código 0.
- `pnpm exec biome check services/api/src/public-booking/google-id-token.ts services/api/test/google-id-token.test.ts`: aprobado.
- `git diff --check`: aprobado.

**Límite de la entrega:** no se cambiaron `google-customer.ts` ni los controladores, no se crearon sesiones y no se probó Google real ni producción. S02 deberá sustituir el camino inseguro en ambas entradas y corregir las pruebas antiguas que aceptan firmas ficticias. Los cambios móviles y demás cambios previos se conservaron. No se creó commit.

**Referencias técnicas consultadas:** [validación de tokens de Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [createRemoteJWKSet de jose 6.2.12](https://github.com/panva/jose/blob/v6.2.12/docs/jwks/remote/functions/createRemoteJWKSet.md) y tipos/código del paquete instalado.

### Registro de ejecución — S02 (2026-11-03)

**Estado:** verificada en código y entorno local de pruebas. **Siguiente tarea:** S03 con GPT-6 Luna · High. El hallazgo 1 queda corregido localmente; no implica que producción haya recibido el cambio.

**Cambios realizados:**

- `services/api/src/public-booking/google-customer.ts`: eliminado el decodificador sin firma `identityOf`. `resolveGoogleMobileIdentity` y `exchangeGoogleCode` utilizan el verificador de S01; tanto tokens directos como los recibidos al canjear códigos requieren firma y claims válidos. Los dos controladores existentes consumen ese resolvedor compartido antes de invocar `customerSessionFor`, por lo que no fue necesario duplicar la integración en cada controlador.
- `services/api/test/google-customer.test.ts` y `mobile.test.ts`: reemplazadas las expectativas que aceptaban firmas ficticias. Las pruebas ejercitan el resolvedor y ambos controladores reales; solo se simulan la red y el adaptador de usuarios/sesiones. Verifican que entradas inválidas no consultan usuarios ni crean sesiones, y que los errores no exponen tokens ni detalles del proveedor.
- `services/api/test/helpers/google-oidc.ts`: tokens firmados con claves RSA efímeras y configuración de pruebas explícita.
- `services/api/src/config/env.ts`, `test/env.test.ts` y `compose.ci.yml`: `GOOGLE_JWKS_FAKE_URL` solo permite configurar claves del doble en `TEST_MODE`; el validador rechaza esa variable fuera de pruebas y prohíbe `TEST_MODE` con dominios reales. La configuración productiva conserva la URL oficial fija. No se habilita un modo que omita la firma.
- `tests/fakes/captura.mjs`: emite tokens RS256 y expone su JWKS público; conserva el canje de códigos de prueba. `tests/escenarios/steps/movil.steps.ts` obtiene el token firmado del doble en lugar de fabricar una firma ficticia.
- `tests/escenarios/features/movil/app-movil.feature`: regresiones HTTP de suplantación en ambas entradas. `docs/testing/README.md`: documentación del doble y su aislamiento.

**Verificaciones ejecutadas:**

- `pnpm --filter @mcet/api exec vitest run test/google-id-token.test.ts test/google-customer.test.ts test/mobile.test.ts test/env.test.ts`: 4 archivos y 89 pruebas aprobadas.
- `pnpm --filter @mcet/api test`: 15 archivos y 270 pruebas aprobadas.
- `pnpm --filter @mcet/api typecheck`: aprobado.
- `pnpm --filter @mcet/escenarios typecheck`: generación BDD y tipos aprobados, también después de añadir las regresiones Gherkin.
- Biome en los módulos y pruebas afectados: aprobado. `git diff --check`: aprobado.
- Reconstrucción de la imagen API y actualización exclusivamente del servicio `api` de `mcet-tests` con `docker compose -f compose.prod.yml -f compose.ci.yml --env-file .env.ci -p mcet-tests up -d --no-deps --build --wait api`: build y healthcheck aprobados. Reiniciado el servicio de captura para cargar sus firmas nuevas. No se eliminaron volúmenes ni datos.
- `MAILPIT_URL=http://localhost:18025 pnpm --filter @mcet/escenarios exec playwright test --project backend --grep 'Login con Google en la app|Google rechaza identidad falsificada'`: 3 escenarios aprobados contra la API reconstruida y PostgreSQL del entorno local.
- `MAILPIT_URL=http://localhost:18025 pnpm --filter @mcet/escenarios exec playwright test --project frontend --grep 'Confirmar la reserva con.*Google'`: 1 escenario aprobado; reserva web confirmada con acceso Google y proveedor simulado.

**Límites:** la validación HTTP y web usa claves y proveedor sintéticos, no Google real. No se verificó una instalación móvil nativa ni se hizo despliegue, rotación de secretos o revocación de sesiones reales. No hay cambios de dependencias ni lockfiles atribuibles a S02. Los cambios anteriores se conservaron y no se creó commit.

### Registro de ejecución — S03 (2026-11-03)

**Estado:** verificada en código y pruebas locales. **Siguiente tarea:** S04 con GPT-6.1 Sol · High. El hallazgo 2 queda corregido localmente; no implica que producción haya recibido el cambio.

**Cambios realizados:**

- `services/admin/src/config.ts`: elimina los valores de respaldo para usuario/contraseña. `loadConfig()` exige `ADMIN_INITIAL_USER` y `ADMIN_INITIAL_PASSWORD` antes de construir configuración; rechaza valores vacíos, usuario fuera de minúsculas/sin espacios exteriores, usuario de más de 100 caracteres y contraseña de más de 128 caracteres. Los errores nombran la variable, nunca su valor.
- `services/admin/src/db/admin-db.ts`: conserva la creación idempotente existente, de modo que un usuario que ya existe no recibe un hash nuevo al reiniciar; el registro de auditoría ahora describe una cuenta inicial, no una cuenta predeterminada.
- `services/admin/test/admin.test.ts`: credenciales generadas aleatoriamente por prueba; regresiones para configuración ausente/límites, login correcto e incorrecto y reinicio sobre el mismo SQLite con otro valor inicial, comprobando que no cambia el hash.
- `compose.yml` y `compose.prod.yml`: requieren y propagan ambas variables. `.env.example` deja ambos valores vacíos para que el desarrollador los defina; `compose.ci.yml` usa valores ficticios exclusivos de las pruebas.
- `README.md`: explica el bootstrap del panel y que cambiar la variable no cambia el hash SQLite ni revoca sesiones. La rotación y revocación operativas quedan pendientes de autorización y procedimiento.

**Verificaciones ejecutadas:**

- `pnpm --filter @mcet/admin test`: 1 archivo, 10 pruebas aprobadas. Incluye la prueba de configuración sin credenciales y la persistencia del hash tras reinicio.
- `pnpm --filter @mcet/admin typecheck`: aprobado.
- `pnpm exec biome check services/admin/src/config.ts services/admin/src/db/admin-db.ts services/admin/test/admin.test.ts`: aprobado.
- `docker compose -f compose.yml config --quiet` con `ADMIN_INITIAL_USER` y `ADMIN_INITIAL_PASSWORD` ficticios en el entorno: aprobado, sin mostrar la configuración resuelta.
- `docker compose -f compose.prod.yml -f compose.ci.yml --env-file .env.ci config --quiet` con valores ficticios de bootstrap: aprobado, sin mostrar la configuración resuelta.
- `docker compose -f compose.prod.yml --env-file .env.ci config --quiet` sin las dos variables: rechazado como se espera, señalando que falta `ADMIN_INITIAL_PASSWORD`/`ADMIN_INITIAL_USER`.
- `git diff --check`: aprobado.

**Límites:** no se borraron volúmenes, no se levantaron servicios, no se cambió una cuenta de una instalación existente y no se revocaron sesiones. La rotación en instalaciones actuales es una operación separada. No se modificaron dependencias ni lockfiles y no se creó commit.

### Registro de ejecución — S04 (2026-11-03)

**Estado:** contrato de diseño revisado y documentado; no es una corrección ejecutada. **Siguiente tarea:** S05 con GPT-6.1 Sol · High.

**Entrega:** se añadió a esta sección una matriz para `trialing`, `active`, `past_due`, `read_only` y suspensiones legacy; define que un cambio de Stripe durante el bloqueo actualiza solo el estado económico y que desbloquear nunca fuerza `active`. También fija la fuente de verdad en PostgreSQL, transacción/auditoría, errores de API, recuperación ante fallo del motor y los consumidores de autenticación por cookie/Bearer, OTP/Google, autorización por organización, reservas públicas, facturación, MCP y motor Go.

**Inspección técnica:** revisados `services/admin/src/db/platform-db.ts` y `routes/api.routes.ts`; `services/api/src/db/schema.ts`, `drizzle/0012_calendar_status_pending.sql`, `auth/auth.registry.ts`, `auth/auth.guard.ts`, `auth/auth.factory.ts`, `auth/org-access.ts`, `calendars/access.service.ts`, `billing/billing.service.ts`, `public-booking/public-booking.controller.ts`, `mcp/mcp.routes.ts` y `mcp/mcp.service.ts`; y `services/calendar/internal/engine`/`store`.

**Conflictos documentados:** `organizations.status` mezcla hoy valores económicos y `suspended`; el desbloqueo antiguo fuerza `active`; el sincronizador del motor envía el valor almacenado sin derivar la restricción; SQLite es la fuente actual de la lista activa del panel; Google del cliente final y MCP no dependen solo de `SessionGuard`. El contrato describe cómo resolverlos sin cambiar todavía código, esquema, autenticación o RPC.

**Verificación y límites:** revisión de implementación y matriz de estados, como exige S04; `git diff --check` aprobado. No se añadieron ni ejecutaron pruebas, migraciones o verificaciones de runtime porque la entrega de esta tarea es exclusivamente de diseño. S05 implementó el backfill/importación legacy, pero no se consultaron datos de producción; el inventario de filas y sus IDs huérfanos reales quedan pendientes de una migración operativa controlada. No se creó commit.

### Registro de ejecución — S05 (2026-11-03)

**Estado:** verificada en código y entorno local de pruebas. **Siguiente tarea:** S06 con GPT-6.1 Sol · High. La persistencia y las respuestas administrativas quedan implementadas; la comprobación del bloqueo en autenticación/autorización pertenece a S06 y la proyección al motor a S07. No se afirma que producción haya recibido el cambio.

**Cambios realizados:**

- `services/api/drizzle/0013_user_restrictions.sql` y `services/api/src/db/schema.ts`: añaden `app.user_restrictions`, límites de motivo/actor, backfill de propietarios con organizaciones suspendidas vivas como casos que requieren reconciliación, auditoría, `calendar_status_pending` y revocación legacy de sesiones y tokens MCP. Las organizaciones borradas no generan restricciones nuevas.
- `services/admin/src/db/platform-db.ts`: PostgreSQL es autoridad. Crear/quitar restricciones, revocar sesiones Better Auth y tokens MCP, escribir auditoría y marcar organizaciones propietarias vivas como pendientes se ejecuta en una transacción. Bloquear/desbloquear repetidamente es idempotente, y desbloquear no modifica el estado económico. Fallos de PostgreSQL generan 503; usuario desconocido 404; suspensión legacy sin reconciliar 409.
- `services/admin/src/index.ts`: al arrancar importa las filas históricas de SQLite en una transacción, evita duplicados y registra solo el recuento de IDs huérfanos para revisión. Compose espera a que la API complete migraciones y esté saludable antes de iniciar el panel.
- `services/admin/src/routes/api.routes.ts` y `admin-db.ts`: lista y estadísticas leen restricciones de PostgreSQL. SQLite conserva auditoría/historial como espejo reparable; reintentos tras una confirmación PostgreSQL reparan el espejo sin duplicar eventos. Los endpoints devuelven 202 y `calendarStatusPending=true` si queda una organización por sincronizar, o 200 cuando no hay proyección pendiente.
- `services/admin/test/platform-db.test.ts`, `services/admin/test/admin.test.ts` y `services/api/test/database/business.int.test.ts`: cubren bloqueo/desbloqueo idempotente, estado `read_only`, rollback ante usuario inexistente y error de PostgreSQL, migración desde base vacía, y backfill sobre una versión anterior conservando la suspensión legacy y excluyendo tombstones.

**Verificaciones ejecutadas:**

- `pnpm --filter @mcet/admin test`: 2 archivos, 14 pruebas aprobadas.
- `pnpm --filter @mcet/admin typecheck` y `pnpm --filter @mcet/api typecheck`: aprobados.
- `pnpm test:db`: 7 archivos, 67 pruebas API aprobadas; pruebas Go de `internal/engine` y `internal/outbox` aprobadas.
- `pnpm --filter @mcet/api exec vitest run --config vitest.database.config.ts test/database/business.int.test.ts`: 1 archivo, 16 pruebas aprobadas, incluida migración desde base vacía y desde esquema anterior.
- `pnpm exec biome check` sobre los ocho archivos TypeScript afectados: aprobado; `git diff --check`: aprobado.
- `docker compose -f compose.yml config --quiet` y `docker compose -f compose.prod.yml -f compose.ci.yml --env-file .env.ci config --quiet`, con credenciales ficticias de bootstrap: aprobados.

**Límites:** no se consultó ni migró una base de producción, no se levantaron servicios de producción y no se desplegó. Los IDs huérfanos reales de SQLite solo se podrán inventariar durante una migración operativa controlada. Este cambio no asegura por sí solo que cada flujo de autenticación/autorización compruebe la restricción (S06), ni que el motor reciba el estado efectivo (S07). No se creó commit; se conservaron los cambios móviles y anteriores.


### Registro de ejecución — S06 (2026-11-03)

**Estado:** verificada en código, con pruebas unitarias, de integración sobre PostgreSQL real y escenarios BDD HTTP (B2). **Siguiente tarea:** S07. No se desplegó.

**Cambios realizados:**

- `auth/org-access.ts`: `isUserRestricted`, `isEmailRestricted`, `requireUnrestrictedUser`, `resolveEffectiveOrganizationStatus` y `getEffectiveOrganizationAccess` leen `app.user_restrictions`; estado efectivo `suspended` si el propietario está restringido o la organización está suspendida; `org_suspended` (403) distinto de `org_read_only`. Un error de consulta se propaga (falla en cerrado).
- `auth.registry.ts` (cookie/Bearer), `auth.factory.ts` (hooks de creación/renovación de sesión, rutas por correo/OTP/recuperación, plugin de guarda para sesiones activas, `customAccessTokenClaims`/`customUserInfoClaims` de OAuth), `google-customer.ts` y `mobile.controller.ts` (Google), `mcp.service.ts`/`tools.ts` (MCP, `invalid_token`).
- `access.service.ts`, `calendars.service.ts`, `members.service.ts`, `business-profile.service.ts`, `public-business.service.ts`, `me.controller.ts` y `public-booking.controller.ts`: estado efectivo desde PostgreSQL en escrituras, perfil/directorio/imagen públicos y reservas (`404 calendar_not_found`, `409 calendar_unavailable`), también con `calendar_status_pending = true`. Bloquear a un colaborador no suspende al propietario.

**Regresiones B2:** `tests/escenarios/features/seguridad/bloqueo.feature` (4 escenarios) y pasos en `seguridad.steps.ts`: bloquean/desbloquean por el panel real (`admin.localhost` → PostgreSQL) y comprueban cookie, Bearer y contraseña (401 genérico sin motivo, y recuperación al desbloquear), token MCP ya emitido (401 `invalid_token`), colaborador bloqueado sin efecto sobre el propietario, y propietario bloqueado con calendario público 404 y lectura conservada por otro miembro.

**Pruebas añadidas/actualizadas:** `access-security.test.ts`, `auth-captcha.test.ts`, `mobile.test.ts`, `business-profile-api.int.test.ts` y `public-business-api.int.test.ts`.

**Verificaciones ejecutadas:** `pnpm --filter @mcet/api typecheck` (aprobado); `pnpm --filter @mcet/api test` (15 archivos, 291 pruebas); `vitest run --config vitest.database.config.ts` (7 archivos, 69 pruebas, PostgreSQL real); `pnpm exec biome check` sobre los 24 archivos TypeScript modificados de `services/api` (aprobado); `git diff --check` (aprobado).

**B2 ejecutado:** se reconstruyeron solo `api` y `admin` de `mcet-tests` (sin borrar volúmenes; el contenedor `admin` anterior era previo a S03 y no tenía las credenciales de bootstrap). `playwright test --project backend --grep "Bloqueo de cuentas"`: 4 aprobados (dos ejecuciones); proyecto `backend` completo: 86 aprobados (sin `@reloj`).

**Límites:** `org_suspended` de un miembro con rol de escritura (editor requiere Google) solo está cubierto por pruebas unitarias; no se verificó que los escenarios nuevos fallen contra la imagen anterior a S06. El paso de invitación existente usa `Date.now()` para el correo, por lo que dos escenarios con el mismo invitado en paralelo colisionan (se usó otro nombre). La proyección del estado efectivo al motor Go corresponde a S07. No se creó commit.

### Registro de ejecución — S07 (2026-11-03)

**Estado:** verificada. **Siguiente tarea:** S08.

**Cambios:** `billing.service.ts`: `syncCalendarStatus` calcula el estado efectivo con `resolveEffectiveOrganizationStatus` (`suspended` si el propietario tiene restricción; si no, el económico) dentro de la transacción con `FOR UPDATE`, envía `setOrgStatus` y solo entonces baja `calendar_status_pending`; si el RPC falla, la transacción termina y el marcador se conserva para el reconciliador. `setStatus` guarda primero el estado económico y no convierte un fallo del motor en error del webhook. Los webhooks nunca quitan una restricción.

**Pruebas:** `services/api/test/database/org-status-sync.int.test.ts` (PostgreSQL real): motor caído → bloqueo persistido → reintento; webhook durante el bloqueo conserva `suspended` y, al desbloquear, proyecta el estado económico más reciente; organizaciones cerradas no se proyectan; un bloqueo durante un envío en curso no queda sin proyectar.

**Verificaciones:** `vitest.database.config.ts` 8 archivos y 76 pruebas aprobadas; `pnpm --filter @mcet/api test` aprobado; `pnpm --filter @mcet/admin test` 14 aprobadas; `go -C services/calendar test -count=1 ./internal/engine ./internal/outbox` aprobado; `playwright --project backend --grep '@seguridad|Bloqueo de cuentas'` 7 aprobados; `--project reloj --grep 'Un pago fallido pasa'` 1 aprobado.

**Límites:** sin despliegue ni datos de producción.

### Registro de ejecución — S08 (2026-11-03)

**Estado:** verificada. **Siguiente tarea:** I01.

**Vía elegida:** limitador propio sobre `app.rate_limits` (tabla que ya usa Better Auth), porque su limitador HTTP solo se ejecuta en el manejador HTTP y limita por IP; no ofrece clave por cuenta ni se puede invocar desde `auth.api.*`. Una sola vía: los endpoints móviles no atraviesan el manejador de Better Auth, así que no hay doble conteo.

**Cambios:** `services/api/src/mobile/mobile-auth-limiter.ts` (nuevo): `INSERT … ON CONFLICT DO UPDATE` atómico con ventana fija; mismos umbrales que `rateLimit.customRules` (sign-in 10/60 s, sign-up y forgot-password 5/3600 s); claves `mobile:<acción>:ip:<IP real>` y `mobile:<acción>:acct:<HMAC del correo normalizado>` (sin correo en claro); ambas se cuentan siempre. Un error de base de datos se propaga (no concede el intento). El mismo 429 vale para cuentas existentes e inexistentes. Se desactiva solo con `TEST_MODE`, igual que el de Better Auth. `mobile.controller.ts` lo invoca en sign-in, sign-up y forgot-password; `mobile.module.ts` lo registra; `problem.filter.ts` traduce `headers["Retry-After"]` a la cabecera HTTP en los 429.

**Pruebas:** `test/database/mobile-auth-limiter.int.test.ts` (8, PostgreSQL real, sin `TEST_MODE`): 429 y `Retry-After`; variar la IP no libera la cuenta; variar la cuenta no libera la IP; reapertura tras la ventana; contadores independientes por acción; concurrencia sin superar el máximo; sin correo en claro. `test/problem-filter-429.test.ts` (2). `mobile.test.ts` adaptado al nuevo constructor.

**Verificaciones:** `pnpm --filter @mcet/api test` 303 aprobadas; `pnpm --filter @mcet/api typecheck` y Biome aprobados.

**Límites:** el gateway sigue aplicando su límite público a estas rutas; no se hizo prueba de carga contra un despliegue. Los escenarios BDD corren con `TEST_MODE` y por tanto no ejercen este limitador.

### Registro de ejecución — I01 (2026-11-03)

**Estado:** verificada. **Siguiente tarea:** M01.

**Verificaciones:** `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check` aprobados; `pnpm test:unit` (81 + 13 + 303 API + 14 admin + 6 + 17) aprobado; `vitest.database.config.ts` 76 + 8 de límites con PostgreSQL real; `go test ./internal/engine ./internal/outbox` aprobado; imágenes `api` y `admin` de `mcet-tests` reconstruidas y saludables; `playwright --project backend` 86 aprobados (incluye suplantación Google, bloqueo, aislamiento y facturación); `--project reloj` del pago fallido aprobado.

**Defecto hallado y corregido:** `compose.prod.yml` exige `ADMIN_INITIAL_USER/PASSWORD` al interpolar, antes de aplicar `compose.ci.yml`, así que `pnpm test:env:up` y el workflow nocturno fallaban con las variables sin definir. Se añadieron a `.env.ci` (valores ficticios, los mismos de `compose.ci.yml`).

**Hallazgos 1–5:** 1 (Google) S01–S02; 2 (credenciales admin) S03; 3–4 (bloqueo y desbloqueo) S04–S07; 5 (límites móviles) S08. Cada uno tiene regresión ejecutada.

**Pendiente operativo, no ejecutado ni autorizado:** rotar la cuenta administrativa y revocar sesiones en instalaciones existentes, inventariar filas `suspended` legacy y revisar sesiones tras el despliegue. El limitador de S08 no se ejerce en los escenarios (corren con `TEST_MODE`). Sin despliegue.

### Registro de ejecución — M01 (2026-11-03)

**Estado:** verificada. **Siguiente tarea:** M02.

**Defectos corregidos** (`services/mobile/src/index.ts`): `addBusinessLocation` enviaba `{ ...sede, expectedVersion }` en vez de `{ location, expectedVersion }` y declaraba un perfil como respuesta (el servidor devuelve `PrivateLocation`); `deleteBusinessLocation` mandaba `expectedVersion` en la URL, sin cuerpo ni `Idempotency-Key` (el servidor exige `{ expectedVersion }` y la clave, y responde 204); `assignCalendarLocation` omitía la clave. Ahora los tres reciben `idempKey`/`location` y cuerpos conformes. No se añadieron operaciones nuevas.

**Pruebas:** `tests/unit/mobile-app.test.js` («contrato de sedes»): el cliente real, con `fetch` como única frontera, genera cuerpo y cabeceras que cumplen `CreateBusinessLocation`, `ChangeBusinessPublication` y `AssignBusinessCalendar` de `@mcet/schemas` (los mismos que usa el controlador), recibe una sede que cumple `PrivateLocation`, acepta 204 y rechaza sede/versión inválidas antes del `fetch`. Publicar/despublicar también cumplen. **Verificaciones:** M1 (26 pruebas), M2 y Biome aprobados.

**Límite:** el contrato se probó contra los esquemas compartidos, no contra una API desplegada con sesión de propietario.

### Registro de ejecución — M02 (2026-11-03)

**Estado:** verificada en pruebas unitarias; la prueba nativa de la transición pertenece a V01. **Siguiente tarea:** M03.

**Cambios:**

- `src/index.ts`: cada petición tiene plazo (`timeoutMs`, 15 s por defecto) que cubre también la lectura del cuerpo, y acepta una `AbortSignal`. Los fallos son `{ status: 0, code: "timeout" | "network" | "aborted" }`; `isTransportError` es cierto para status 0 (salvo cancelación pedida) y 502/503/504. 401, 403, 409, 422 y 500 son respuestas del servidor y nunca cuentan como falta de red. Un éxito con cuerpo no JSON se rechaza (`invalid_response`) y un error no JSON ya no lanza `SyntaxError`. Hook `onTransportError` del cliente.
- `src/connectivity.ts` (nuevo): `createConnectivityController` (estado decidido por el servidor, una comprobación en vuelo, sondeo cada 30 s solo sin conexión, comprobación inmediata al volver a primer plano, `stop` que cancela y descarta resultados antiguos) y `submitOrQueue`: si el envío falla por transporte —resultado incierto— se encola con la **misma clave de idempotencia**; cualquier respuesta del servidor se propaga sin encolar.
- `App.tsx`: el controlador se crea en un efecto (compatible con StrictMode), recibe los fallos de transporte del cliente y `AppState`; la comprobación de recuperación reutiliza la restauración de sesión y refresco de datos existente. Guardar el perfil usa `submitOrQueue`. Se eliminó el efecto que solo comprobaba cuando `conn` ya era `offline`.

**Pruebas:** `tests/unit/mobile-connectivity.test.js` (14, reloj simulado y `fetch` controlado): plazo vencido, red caída, 502/503/504 vs 401/403/404/409/422/500, cancelación, cuerpos no JSON; arrancar conectado → perder red → guardar en cola → recuperar; 401 sin efecto; API caída sin solapar comprobaciones; primer plano; desmontaje; probe síncrono que lanza. **Verificaciones:** M1 (40 pruebas), M2, Biome y `pnpm lint` aprobados.

**Límites:** la mutación incierta se reenvía solo vía la cola y con la misma clave; que el servidor conserve el recibo es la subdependencia de M03. Sin dependencia nueva (no se usa NetInfo). No se ejecutó en dispositivo.

### Registro de ejecución — M03 (2026-11-03)

**Estado:** verificada en pruebas unitarias; reinicio y dispositivo en V01. **Siguiente tarea:** M04.

**Cambios (`services/mobile/src/sync.ts`):** el plazo de 24 h solo impide **nuevos** envíos. Una operación `sending`, o `pending/authentication_required` con `retryCount > 0`, tiene un resultado incierto y se reconcilia antes de declararla caducada (también aunque dependa de otra pendiente: consultar no muta). `getPendingOperations` ya no caduca operaciones con `retryCount > 0`. Resultados: recibo 2xx → `synced` sin reenviar; 404 → no se aplicó (dentro de plazo se reenvía **con la misma clave**; fuera de plazo `expired` con `lastError: "expired_unsent"` y sin enviar); 410 → resultado desconocido, `expired` con `outcome_unknown`, sin reenviar; 401 → pausa con `authRequired` y conserva la operación; red/5xx al consultar → conserva la incertidumbre; recibo con error: 409 → `conflict`, 403/422 → `failed`, otro 4xx → `failed`, 5xx no concluyente; nunca se convierte en éxito.

**Subdependencia comprobada — recibos durables reales:** solo `business-profile.service.ts` escribe `app.offline_operations` (perfil, publicar, sedes, imágenes, asignación). `POST /my/bookings/:id/cancel` **ignora** `Idempotency-Key` y no guarda recibo, así que los tests anteriores que suponían un recibo de `booking.cancel` eran incorrectos. Decisión: `booking.cancel` se reconcilia **por estado** con `GET /my/bookings?includePast=true`, que no incluye citas canceladas (`status <> 'cancelled'` en el motor): cita ausente o cancelada → se aplicó (`synced`, sin reenviar); cita vigente y fuera de plazo → no se envía; vigente y dentro de plazo → se reenvía con la clave original; error de red → se conserva la incertidumbre. Limitación: una cita ausente por otra causa (borrada por el negocio) también se da por cancelada, que es el resultado que la persona buscaba. No se modificó el servidor.

**Pruebas:** `tests/unit/mobile-offline.test.js` (+13; 2 existentes adaptados a `profile.update`): timeout tras commit y reapertura >24 h; 404 vencido sin mutar; caída al consultar; 401; 410; reenvío con clave original; recibos 409/422/403/500; nunca enviada y vencida; cancelación por estado (4 casos). Con el `sync.ts` anterior, las regresiones específicas de M03 fallan. **Verificaciones:** M1 (61 pruebas), M2 y Biome aprobados.

### Registro de ejecución — M04 (2026-11-03)

**Estado:** verificada en pruebas unitarias; transacción nativa y reinicio en V01. **Siguiente tarea:** M05.

**Cambios (`services/mobile/src/storage.ts`):** la cuota de 100 cuenta solo operaciones no confirmadas (`state !== "synced"`). `compactQueue` retira únicamente `synced` y conserva: las referenciadas en `dependsOn` por alguna no confirmada (sin ellas el sincronizador bloquearía para siempre a sus dependientes), las `SYNCED_HISTORY_MAX = 20` más recientes y solo las más jóvenes que `operationReceiptDays` (90). `sending`, `pending`, `conflict`, `failed`, `expired` y `authentication_required` nunca se compactan. Compactar y añadir son una sola escritura de la cola (con el backend SQLite, una transacción exclusiva): si falla, la cola previa queda intacta. Se mantiene la cota de bytes.

**Pruebas (+8):** más de 100 completadas permiten encolar; 100 pendientes siguen bloqueando; estados no terminales intactos tras 60 compactaciones; dependencia de una confirmada conservada y liberada después; el sincronizador libera al dependiente tras compactar; retención de 90 días; disco lleno no pierde la cola; escrituras simultáneas preservan ambas operaciones. **Verificaciones:** M1 (61), M2, Biome.

**Límite:** `failed`/`expired` ocupan cuota hasta que la persona los descarte; su visibilidad en la interfaz es de M06.

### Registro de ejecución — M05 (2026-11-03)

**Estado:** verificada en pruebas deterministas con promesas controladas; nativo en V01. **Siguiente tarea:** M06.

**Cambios:**

- `storage.ts`: barrera por cuenta (`beginExit` → `closing`; `clearAccount` → `closed` **antes** de purgar; `openAccount`; `accountState`). Con la cuenta `closed`, `saveBookings/saveSummary/saveOwnerProfile`, `updateOperation` y `removeOperation` descartan la escritura tardía y `enqueueOperation` lanza `AccountClosedError`. Una respuesta que llega después de la purga no recrea datos privados, tampoco si la purga falla.
- `sync.ts`: la sincronización queda ligada a la sesión con que empezó (`client.getToken()`); si la cuenta pasa a `closing/closed` o el token cambia, se detiene antes de la siguiente operación (`interruptedBy: "exit" | "session_changed"`) y también descarta una consulta de recibo hecha mientras cambiaba la sesión. Así la cola de A nunca se envía con el token de B. `awaitActiveSync` espera (con plazo) a la sincronización en vuelo sin propagar sus errores.
- `session-exit.ts` (nuevo): `signOutAccount` = `beginExit` → drenar → `clearAccount` → revocar token → olvidar sesión local. Resultado explícito: `signed_out`, `signed_out_unrevoked` (sin red: la sesión local se cierra igualmente, el servidor puede seguir considerándola válida hasta que caduque) o `purge_failed`. No deshace mutaciones ya confirmadas.
- `App.tsx`: `onSignOut` usa la barrera; `loadSession` reabre la cuenta al iniciar sesión.

**Pruebas (`tests/unit/mobile-session-exit.test.js`, 8, estables en 3 ejecuciones):** respuesta tardía tras la purga sin recrear lecturas/colas; espera agotada; cambio de token sin enviar la cola anterior; la cuenta B no se ve afectada; red caída al revocar; 401 al revocar; fallo de purga; reapertura. **Verificaciones:** M1 (69 pruebas), M2, Biome.

**Límites:** los avisos de interfaz para `signed_out_unrevoked` y `purge_failed` y la confirmación ante pendientes son de M06.

### Registro de ejecución — M06 (2026-11-03)

**Estado:** verificada en pruebas unitarias; interacción nativa en V01. **Siguiente tarea:** C01.

**Cambios:** `session-exit.ts`: `requestSignOut` cuenta los cambios no confirmados (`unresolvedOperations` = todo salvo `synced`: pendientes, en envío, esperando acceso, con conflicto, fallidos y caducados) y pide confirmación antes de descartarlos; cancelar no toca sesión, token, cola ni cuenta; con cero pendientes sale directo; un fallo al leer la cola se propaga (no se descarta a ciegas). `App.tsx`: `Alert.alert` nativo (accesible, sin librería nueva) con «Cancelar» y «Descartar y salir» (`destructive`), `onDismiss` = cancelar; el contador del banner usa `unresolvedOperations`; `purge_failed` y los errores de lectura/purga muestran `signOutFailed` y `signed_out_unrevoked` muestra `signOutUnrevoked`, ambos con región viva accesible. `index.ts`: seis claves nuevas en es, en, fr, pt, de e it (tipadas: el compilador exige los seis idiomas).

**Pruebas (+7 en `mobile-session-exit.test.js`):** cero pendientes sin preguntar; cuenta de los seis estados; cancelar conserva todo; confirmar borra privados de la cuenta sin tocar directorio/perfiles públicos ni la cuenta B; fallo de purga; fallo de lectura; los seis idiomas tienen los textos, con `{count}`. **Verificaciones:** M1 (76 pruebas), M2, `pnpm i18n:check`, `pnpm lint`.

**Límite:** no se ejercitó el diálogo en un dispositivo; sin librería de pruebas de interacción nueva.

### Registro de ejecución — C01 (2026-11-03)

**Estado:** verificada (diseño). **Siguiente tarea:** C02a.

**Entrega:** [ADR 0020](docs/adr/0020-sincronizacion-incremental-offline.md): recursos sincronizados (`business_profile`, `business_location`) y no soportados (`calendar_locations`, `images`, `bookings`, `agenda`, `public_profiles`, declarados en cada respuesta); registro de cambios por triggers en la misma transacción, sin datos privados; orden entre transacciones que confirman en distinto orden mediante `xid8` + `pg_snapshot_xmin` (el lector solo entrega transacciones terminadas); cursor opaco firmado ligado a actor, ámbito autorizado, versión y caducidad de 30 días; `400 invalid_cursor` / `410 sync_cursor_expired`; snapshot paginado con marca de agua y `reset`; retención de 31 días; aplicación atómica en el móvil. Incluye ejemplos de página inicial/intermedia/final, baja, pérdida de permisos, cursor de otra cuenta, cursor caducado y commits desordenados. Contrato en `packages/schemas/src/offline.ts` (`OfflineChangesPage`).

**Hallazgo de diseño:** el trigger de cuotas existente (`guard_business_child`) ya serializa por organización con `FOR UPDATE` sobre el perfil, de modo que el desorden de commits solo se produce entre organizaciones; el horizonte por `xmin` cubre ambos casos. No se diseñó infraestructura de mensajería.

### Registro de ejecución — C02a y C02b (2026-11-03)

**Estado:** verificadas con PostgreSQL real. **Siguiente tarea:** C03.

**C02a:** `services/api/drizzle/0014_sync_changes.sql` (+ journal): `app.sync_changes(seq, txid xid8, org_id, resource, resource_id, op, created_at)` con índices; función `SECURITY DEFINER` y triggers `AFTER INSERT/UPDATE/DELETE` sobre `business_profiles` y `business_locations`; siembra un cambio inicial por cada fila existente. Cubre servicio, cascada de borrado de organización y SQL directo; un rollback no publica nada.

**C02b:** `offline-cursor.ts` (HMAC-SHA256 con clave derivada de `BETTER_AUTH_SECRET`, `timingSafeEqual`), `offline-sync.service.ts` (snapshot, cambios, colapso por recurso, contenido materializado al leer con el mismo DTO del panel, `pruneChanges` horaria), `offline.controller.ts` (`GET /api/offline/changes` delega en el actor autenticado), `business-profile.service.ts#readPrivateProfile` (lectura pura, sin crear borradores). Schemas: `OfflineChangesPage`, `OFFLINE_RESOURCES`, `OFFLINE_UNSUPPORTED`.

**Pruebas (`test/database/offline-changes.int.test.ts`, 16):** altas/cambios/bajas, rollback, cascada, ruta real del servicio; snapshot inicial/intermedio/final y repetición de cursor; modificación y baja; colapso; transacciones desordenadas (el horizonte retiene lo posterior); paginación sin pérdidas ni repeticiones; cuenta B sin acceso a A y cursor ajeno → 400; cursores falsificados (6 variantes) → 400; caducado → 410; pérdida de permiso → 410 y snapshot sin el negocio; cuenta restringida; retención. El test antiguo que fijaba `items: []`/`nextCursor: null` se sustituyó por uno del contrato real. **Verificaciones:** BD 10 archivos y 100 pruebas, API 303, `test:schemas` 136, typecheck y Biome aprobados.

**Límites:** la siembra de la migración sobre una base con datos reales no se ejercitó (las migraciones de prueba parten de vacío); el cursor no incluye identificador de instalación (el contrato no lo transporta). Sin despliegue.

### Registro de ejecución — C03 (2026-11-03)

**Estado:** verificada con pruebas unitarias y el contrato HTTP real; transacción SQLite/SQLCipher y reinicio en dispositivo en V01. **Siguiente tarea:** R01.

**Subtarea previa (atomicidad entre claves):** `StorageBackend` no permitía transacciones multi-clave. Se añadió `transaction(operations, maxBytes)`: en `native-storage.ts` usa `withExclusiveTransactionAsync` y comprueba la cuota total del resultado (si falla, no se aplica nada); en el almacenamiento en memoria se cifra y valida la cuota antes de tocar nada y se aplica sin esperas intermedias. `applyChangesPage` no usa `set` independientes.

**Cambios:**

- `storage.ts`: `applyChangesPage` aplica en UNA transacción datos (perfil, sedes), bajas, cursor y marcas sobre la cola. Idempotente por revisión por recurso (una página repetida o un upsert antiguo no duplica, retrocede ni revive una baja). `reset` limpia la caché de los recursos declarados pero nunca la cola ni los pendientes. Una edición local sin resolver se conserva; si el servidor ya tiene una versión posterior, se marca `conflict` (`profile_conflict`). Una baja marca los pendientes de ese recurso como `failed` (`resource_removed`) para que un pendiente antiguo no lo resucite; las `sending` se dejan al sincronizador. `loadLocations`, `loadSyncCursor`, `clearSyncCursor`.
- `sync.ts#pull`: pagina hasta quedar al día, aplica cada página con su cursor; `410 sync_cursor_expired` o `400 invalid_cursor` reinician con un snapshot una sola vez (sin tocar la cola); 401 → `auth_required`; transporte → `offline`; cuota → `storage_error` sin avanzar el cursor; cierre de cuenta o cambio de token → `interrupted` sin aplicar; una sola ejecución por cuenta.
- `index.ts#getOfflineChanges` valida la respuesta con `OfflineChangesPage` (el contrato antiguo `nextCursor: null` ya no se acepta como descarga válida). `request-errors.ts` (módulo hoja) evita un ciclo de imports. `App.tsx`: tras enviar la cola, se descarga y se refresca el perfil.
- Backend: `tests/escenarios/features/offline/descarga-incremental.feature` + `steps/offline.steps.ts`: snapshot con reinicio y recursos declarados, cambio y descarga con el cursor anterior, repetición sin elementos nuevos, cursor de otra cuenta y manipulado → 400 `invalid_cursor`, sin filtrar datos.

**Pruebas:** `tests/unit/mobile-pull.test.js` (13): snapshot paginado y cursor persistido con una sola transacción por página; interrupción sin avance parcial; bajas y no resurrección; `reset` conserva la cola; conflicto sin sobrescribir; pendiente de recurso dado de baja; cursor vencido/inválido; 401, red y almacenamiento lleno; aislamiento entre cuentas y página tardía tras salir; cambio de token; ejecución única; todo-o-nada en memoria. **Verificaciones:** M1 (89 pruebas), M2, Biome, `pnpm --filter @mcet/escenarios typecheck`, `playwright --project backend` con la imagen `api` reconstruida (migración 0014 aplicada).

**Descubierto:** el borrador del perfil se crea de forma perezosa al abrirlo (`ensureOwnerDraft`); hasta entonces el feed no tiene nada que entregar, y el cambio llega cuando se crea.

**Límites:** no se ejecutó en dispositivo ni con SQLCipher real; el feed no cubre citas, agenda ni imágenes (declarados en `unsupported`).

### Registro de ejecución — R01 y R02 (2026-11-03)

**Estado:** R01 verificada en pruebas unitarias; R02 **implementada, validación pendiente** (el recorrido real en dispositivo y contra el sitio es de V01). **Siguiente tarea:** V01.

**Contrato de reserva inspeccionado:** `POST /api/public/v1/calendars/:slug/holds` exige ALTCHA + `Idempotency-Key` y el hold dura diez minutos; la confirmación pide verificación de contacto. La app no tiene pantalla nativa de reserva. Decisión (la que prevé el plan): **reutilizar la página de reserva del proyecto en el navegador seguro del sistema** (`expo-web-browser`, ya instalado), sin copiar el motor de reserva ni pasar tokens por la URL. Esto no equivale a reserva nativa offline: sin conexión no se reserva.

**R01 (`src/booking-flow.ts`):** `resolveBookingUrl` valida el destino y devuelve la URL canónica construida solo con el `slug` (formato de la API) y la ruta traducida real del idioma de la app (`pathFor("booking", lang, { slug })`: `/reservar/:slug`, `/book/:slug`…) sobre el `siteUrl` del bootstrap. `bookingUrl` solo puede coincidir, nunca decidir: se rechazan otros hosts, subdominios-trampa, credenciales (`@`), `//`, `\`, consulta, fragmento, puerto distinto, esquemas distintos de http(s) (`javascript:`, `data:`, `intent:`, `file:`, esquemas propios), http fuera de localhost, slugs inválidos y rutas ajenas. Análisis manual: el `URL` de React Native está incompleto. `createBookingFlow`: la intención (`businessId`, `calendarId`, `locationId`, `slug`, `url`) nunca contiene contraseñas, OTP, tokens ni holds; elegir otro destino la sustituye; uno no reservable o con enlace inválido no deja intención.

**R02:** `open()` comprueba la conexión, anota las citas del servidor, abre el navegador y, al volver, vuelve a leerlas: `confirmed` solo si aparece una cita nueva; `not_confirmed` si no (abandono o plaza ocupada, que la página decide); `unknown` sin sesión en la app o si falla la consulta; `offline` y `browser_error` explícitos. Una sola ejecución a la vez. Volver atrás conserva el destino. `App.tsx`: el botón por destino llama a `onBook`, se desactiva si no es reservable (con `accessibilityState`) y muestra mensajes en los seis idiomas (siete claves nuevas); ya no se limita a cambiar de pestaña.

**Pruebas (`tests/unit/mobile-booking.test.js`, 14):** URL canónica por idioma; absoluta del propio sitio; local con puerto; 20 enlaces maliciosos y 9 slugs / 5 sitios mal formados rechazados; dos destinos distintos mantienen el correcto; no reservable e inválido; sin conexión; confirmación solo con cita nueva del servidor; sin sesión / fallo al volver; navegador no disponible; ninguna credencial en la URL; pulsación repetida; textos en seis idiomas. **Verificaciones:** M1 (suite móvil completa), M2, `pnpm lint`, `pnpm i18n:check`.

**Decisión de contrato pendiente (no se tocó el servidor):** la API publica `bookingUrl: "/c/<slug>"` (`public-business.service.ts:445,667`), pero el sitio web **no registra ninguna ruta `/c/:slug`**: la página de reserva es `booking` (`/reservar/:slug`, `/book/:slug`…). El panel web también muestra `/c/{slug}` como URL pública (`business-profile-settings.tsx`). La app es independiente de ese valor (usa el slug y la tabla de rutas), pero la URL publicada es un enlace muerto para otros consumidores. Hay que decidir entre (a) añadir una redirección `/c/:slug` → ruta de reserva en el idioma del dominio, o (b) que la API publique la ruta traducida. Cambiarlo altera un contrato público y su conjunto de pruebas, por eso queda para decisión.

**Límites:** el recorrido no se probó en dispositivo ni contra el sitio con un calendario real; "plaza ocupada" lo muestra la página web, la app solo informa de que no hay cita nueva. La reserva de un cliente sin sesión en la app se confirma por correo o en «Mis citas» al entrar.

### Registro de ejecución — V01 (2026-11-03)

**Estado:** integración verificada en todo lo que este entorno puede ejecutar; **la evidencia nativa (N1) queda bloqueada**. No se despliega.

**Ejecutado y aprobado:**

- `pnpm lint` (502 archivos), `pnpm typecheck` (incluye el `tsc` de la app móvil vía web), `pnpm i18n:check`, `npm --prefix services/mobile run typecheck`.
- Builds: API, admin y web. Empaquetado Metro de la app completa para **Android (830 módulos) e iOS (832)** con `expo export`; `expo config` resuelve los plugins `expo-secure-store` y `expo-sqlite` con `useSQLCipher: true`.
- `pnpm test:unit` (schemas 136 + OpenAPI, móvil 103, API 303, admin 14…), `go test -short -race ./...`, `pnpm test:db` (10 archivos, 100 pruebas con PostgreSQL real + Go engine/outbox).
- Escenarios con imágenes reconstruidas (`api`, `admin`): `backend` 88, `reloj` 8, `frontend` 112.

**Fallo ajeno al plan (no corregido):** `pnpm test:mobile` (Playwright emulado, no cuenta como evidencia nativa): 110 aprobados y **2 fallidos** en el proyecto `android`, `panel/cuenta.feature` («Cambiar el nombre, exportar los datos y borrar la cuenta» y «Un propietario cierra su negocio…»): el clic en «Guardar» expira porque otro `<form>` intercepta el puntero en el viewport Android (la captura muestra la página desplazada). Reproducible aislado. `services/web` no cambió desde `b16d89a` y el proyecto `frontend` de escritorio pasa esos escenarios, así que parece un defecto de maquetación preexistente en `account.tsx`. Pendiente de revisión por separado.

**Pendiente (N1) — exactamente lo que falta:** no hay `appium` ni `adb` en el PATH, ni binarios compilados. Matriz mínima sin ejecutar: abrir con red → descargar → cortar red → editar → matar proceso → reabrir → recuperar red → comprobar servidor; respuesta perdida tras commit; API caída; sesión vencida; cambios concurrentes; cursor vencido; baja; disco lleno; cambio de cuenta; recorrido de reserva con navegador seguro; diálogo de cierre de sesión; SQLCipher presente en el binario y rechazo de guardar privados sin él; todo en teléfono y tableta, Android e iOS, en secuencia. Comandos: compilar con `expo prebuild` + build nativo (JDK/Xcode), levantar `pnpm test:env:up`, Appium con una cuenta de prueba y luego `pnpm test:native:mobile`.

**Resumen del plan:** S01–S08 e I01 verificadas; M01–M06 y C01–C03 verificadas en pruebas unitarias/integración (nativo pendiente); R01 verificada; R02 implementada, validación pendiente; V01 bloqueada en lo nativo. **Decisiones/operaciones pendientes:** rotar la cuenta de admin y revocar sesiones en instalaciones existentes, inventario de suspensiones legacy, y la decisión sobre `bookingUrl: /c/<slug>` (ruta inexistente en la web).

### Registro de ejecución — Revisión y correcciones (2026-11-04)

**Motivo:** una revisión del código contra este plan encontró que el cierre de V01 era demasiado optimista. Esta sección prevalece sobre lo afirmado en los registros anteriores.

**Correcciones al registro anterior:** `pnpm typecheck` solo pasaba en local; el job TypeScript del CI estaba en rojo desde `0074257` y no se había comprobado. M03 se dio por verificada con una vía abierta. Las transacciones de `native-storage.ts` no podían funcionar con SQLCipher, y las pruebas no lo veían porque usan un backend simulado.

**Defectos corregidos:**

1. **SQLCipher:** `withExclusiveTransactionAsync` abre una conexión nueva sin `PRAGMA key`, que falla con `file is not a database`. Nuevo `src/sqlite-backend.ts`: una sola conexión con `withTransactionAsync` y una cola que impide que otra consulta se ejecute dentro de una transacción. Evidencia: el SQLCipher 4.17.0 incluido en `expo-sqlite`, compilado aparte, reproduce el fallo y confirma que el flujo de una conexión escribe, cifra y reabre.
2. **CI:** el job TypeScript instala las dependencias de `services/mobile` y comprueba también los tipos de la app. En una copia limpia, `pnpm typecheck` falla sin ellas (exit 1, TS2307) y pasa con ellas.
3. **Hallazgo 7, guardado en línea:** un envío que falla por transporte se encola como intentado (`attempted`, `retryCount: 1`), de modo que se reconcilia antes de caducar. Antes, a las 25 h quedaba `expired` sin consultar el recibo.
4. **Conflicto falso:** `applyChangesPage` no marca `conflict` en una operación con resultado incierto; decide el sincronizador con el recibo.
5. **Sesión tras salir:** `refreshCachedSession` (`session-exit.ts`) descarta una comprobación en vuelo si la cuenta sale, cambia el token o se cancela; `saveSession` respeta la barrera. `App.tsx` lo usa al arrancar y al recuperar la conexión.
6. **Plazo del cursor:** los 30 días son de la posición. Un snapshot en curso, su cursor final y una página con `hasMore` heredan el `exp`; solo alcanzar el horizonte lo estrena. ADR 0020 §6 actualizado.
7. **Contraseña por defecto del admin:** eliminado `dev-api`; con `DB_HOST` definido, la contraseña es obligatoria.

**Pruebas:** `tests/unit/mobile-sqlite-backend.test.js` (6, SQL real con `node:sqlite`), más regresiones en `mobile-offline`, `mobile-connectivity`, `mobile-pull`, `mobile-session-exit`, `admin.test.ts` y `offline-changes.int.test.ts` (3). Con el código anterior de cola y conexión fallan 5 de las regresiones móviles.

**Verificaciones:** `pnpm lint`, `pnpm i18n:check`, `pnpm typecheck`, `npm --prefix services/mobile run typecheck`, `pnpm test:unit` (exit 0), base de datos con PostgreSQL real 103 aprobadas, Metro Android e iOS. Los escenarios se validan en el CI de este commit.

**Fallo intermitente de las pruebas de base de datos:** el CI de `8c3d785` falló con las 103 pruebas aprobadas, por 5 errores `57P01` sin manejar nacidos en `mobile-auth-limiter.int.test.ts`. `pool.end()` resuelve antes de que los clientes cierren su socket y parar el contenedor en ese momento los corta; esa prueba abre más conexiones que las demás por su caso de concurrencia. `test/helpers/database.ts#stopDatabase` espera a los eventos `remove` antes de parar el contenedor, en todas las suites. No se reproduce de forma aislada en local (0 de 8 antes del cambio), así que la evidencia es el código de `pg-pool` y los CI posteriores.

**Sigue abierto:** no hay evidencia en dispositivo (N1); la corrección de SQLCipher se probó con la librería, no en un binario Expo. Falta la prueba HTTP real del 429 (S08) y el contrato contra la API real (M01). `reconciliation_required` no tiene forma de limpiarse sin SQL manual: hay que decidir entre una acción en el panel o un procedimiento documentado.
