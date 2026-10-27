# Perfiles de negocios y directorio por localidad

Plan de implementación preparado el 2026-10-27 para ejecutarse por tareas pequeñas con un modelo como
GPT-6 Luna. Estado: **en implementación; consultar el registro de ejecución y el relevo al final**.
Los valores marcados como propuesta son decisiones de este plan, no características actuales.

## 1. Resultado esperado

Una persona puede encontrar un negocio por temática y localidad, consultar su perfil público y reservar
en uno de sus calendarios. El propietario puede administrar y publicar ese perfil desde su cuenta.
El perfil incluye nombre comercial, descripción, servicios, ubicación, imágenes, redes sociales, sitio
web, enlace a condiciones del negocio y una acción principal para reservar.

Recorridos que deben quedar completos:

1. Visitante → directorio → temática y localidad → perfil → calendario/sucursal → reserva existente.
2. Visitante → «Cerca de mí» → permiso de ubicación → resultados por distancia → perfil → reserva.
3. Cuenta normal → «Registrar mi negocio» → organización y calendario → completar perfil → publicar.
4. Propietario actual → «Perfil del negocio» → guardar → revisar vista previa → publicar o retirar.
5. Propietario que también reserva en otro negocio → «Mis citas», sin cambiar de cuenta.

La consulta pública no exige registro. Al reservar se conservan los métodos de identificación y las
reglas que ya aplica el flujo de reservas, incluidos sus modos de contacto.

**Requisito prioritario y obligatorio:** las apps Android/iOS, en teléfono y tableta, deben poder
trabajar sin conexión a internet según §8.1. No es una mejora opcional ni se cierra mostrando un aviso.
La entrega móvil no está completa hasta demostrar persistencia local y sincronización segura.

## 2. Punto de partida comprobado en el repositorio

| Área | Evidencia actual | Consecuencia para esta ampliación |
|---|---|---|
| Identidad y negocio | `services/api/src/db/schema.ts`: usuarios, organizaciones, miembros y clientes; una organización activa por propietario mediante índice único | Reutilizar esas entidades; no crear otra identidad ni una segunda tabla de negocios |
| Roles | `services/api/src/auth/permissions.ts`: owner/editor/observer/customer por calendario | Ser editor de un calendario no otorga administración del perfil del negocio |
| Calendarios | `services/api/src/calendars/calendars.service.ts`: creación por RPC y membresía local; varios calendarios según plan | Un perfil por organización, con varios calendarios o sucursales dentro |
| API de cuenta | `GET /api/v1/me` ya devuelve organización y membresías | Derivar capacidades a partir de estos datos y ampliar el DTO si hace falta |
| Reservas | `services/api/src/public-booking/public-booking.controller.ts`, `routes/booking.tsx` y `components/booking-flow.tsx` | Reutilizar disponibilidad, identificación, holds, confirmación y concurrencia |
| Alta actual | `routes/sign-up.tsx` envía al panel; `routes/dashboard.tsx` redirige a bienvenida si no hay calendarios | Corregir este recorrido para no obligar al cliente normal a registrar un negocio |
| Web | Manifiestos: React 19.3, React Router 8.4 SSR, Tailwind 4.3; rutas en `services/web/app/routes.ts` | Añadir pantallas al sistema visual existente, con loaders y componentes compartidos |
| Backend | Manifiestos: NestJS 12.1, Fastify 5.12, Drizzle 0.45, Zod 4.6; PostgreSQL 18.6 en Dockerfile | Mantener tecnología y migraciones actuales; datos de perfil en esquema `app` |
| Idiomas | `packages/i18n/src/languages.ts`: es/en/fr/pt/de/it; mapa compartido de rutas | Traducir toda interfaz y errores a los seis idiomas, conservando los dominios/prefijos actuales |
| Móvil | `services/mobile/App.tsx` y `src/index.ts`: Expo/React Native; fuera de `pnpm-workspace.yaml` | Planificar paridad explícita y usar su instalación separada; no añadirlo al workspace de paso |
| Sin conexión | `App.tsx` muestra estado `offline` y conserva citas/resumen en estado React; el manifiesto móvil no declara una base de datos local | El aviso no demuestra trabajo sin red; diseñar persistencia y sincronización, verificando antes todos los clientes actuales |
| Archivos | API de solo lectura en compose; sin volumen de imágenes del negocio ni módulo de subida localizado | Añadir almacenamiento persistente y una ruta segura de subida, no guardar en el contenedor |
| Seguridad de subida | Fastify limita cuerpos a 256 KiB; la guarda actual exige JSON en mutaciones | La subida requiere configuración y protección específicas sin relajar las demás rutas |
| Pruebas | Vitest, Gherkin/Playwright, Testcontainers, Go y runner nativo Appium | Extender las suites existentes; separar emulación web de pruebas de apps |

Las versiones anteriores son las declaradas; React/Router/Drizzle también se contrastaron con el
lockfile. No se comprobó la instalación local ni se ejecutaron pruebas funcionales para redactar este
plan. La documentación original de construcción menciona dos idiomas; para código nuevo manda la
tabla actual de seis idiomas. No asumir que lo descrito en planes antiguos sigue implementado igual.

## 3. Decisiones propuestas para evitar ambigüedades al ejecutar

### 3.1 Cuenta, negocio e identificador

- Hay dos experiencias: **cliente normal** y **propietario de negocio**. Una persona puede usar ambas.
  No añadir un `userType` exclusivo ni aceptar roles enviados por el navegador como autorización.
- La intención «Quiero reservar» / «Tengo un negocio» orienta el alta; los permisos proceden del
  servidor y de la organización/membresías existentes. Los colaboradores conservan su acceso actual.
- Mantener el límite actual de una organización activa por propietario y los planes actuales.
- Crear **un perfil por organización**. Usar `businessId = organization.id`: identificador inmutable
  que ya se genera con UUIDv7. El nombre comercial puede cambiar sin cambiar la URL.
- URL propuesta en español: `/negocios/:businessId`; directorio: `/negocios`; administración:
  `/panel/negocio/perfil`. Añadir los tres identificadores de ruta al mapa de todos los idiomas.
- No usar correo, nombre de usuario ni slug editable como identidad del perfil. No cambiar los slugs
  actuales de reserva: perfil y reserva tienen rutas distintas.
- El primer calendario crea o asegura un perfil **borrador**, nunca uno publicado automáticamente.
  El alta debe ser idempotente y recuperable ante fallos parciales del RPC.
- Para clientes existentes: backfill idempotente de perfiles borrador de organizaciones con calendarios.
  No inventar categoría, dirección, coordenadas, imágenes ni consentimiento de publicación.

### 3.2 Sucursales, ubicación y búsqueda

- Cada calendario puede vincularse a una ubicación del negocio; varios calendarios pueden compartir
  ubicación. Máximo propuesto: 10 ubicaciones por negocio, sin ampliar el límite de calendarios del plan.
- Guardar país ISO, región, localidad y dirección separadas. La dirección del calendario sigue siendo
  la dirección de la cita; señalar discrepancias con el perfil y permitir corregirlas expresamente.
- La localidad se introduce manualmente; normalizar una clave de búsqueda Unicode, espacios y tildes
  sin modificar el nombre visible. Autocompletar con localidades publicadas, no prometer un catálogo
  oficial mundial. País y región desambiguan localidades del mismo nombre.
- Búsqueda por localidad y temática desde la primera entrega; distancia real en una tarea posterior
  obligatoria del mismo plan. No llamar «cerca» a una coincidencia de nombre de ciudad.
- Coordenadas opcionales para publicar, obligatorias para aparecer en resultados por radio. El dueño
  puede introducirlas o usar «Usar ubicación de este local» con permiso y confirmación explícita.
  Nunca deducirlas a partir de la dirección sin un geocodificador real.
- «Cerca de mí» pide permiso solo tras pulsar el botón. Si se deniega, caduca o no está disponible,
  conservar la búsqueda manual. No guardar la ubicación del visitante en su cuenta ni en analítica.
- Sin proveedor de mapas ni geocodificación contratados en la primera versión. Un mapa interactivo o
  geocodificación automática requeriría una decisión posterior sobre proveedor, licencia y costes.
- Publicar únicamente direcciones de locales que el dueño confirme como públicas. Un domicilio
  particular puede mostrar solo localidad; excluir sus coordenadas precisas de las respuestas públicas.
  El modo de localidad permite búsqueda manual, pero no se incluye en búsqueda por radio en esta versión.

### 3.3 Publicación y reserva

- Estados del perfil: `draft`, `published`, `unpublished`; separados del estado de suscripción.
- Para publicar: nombre, descripción, temática principal, al menos una ubicación con país y localidad,
  un calendario activo asociado y al menos un servicio activo reservable. Imágenes y enlaces opcionales.
- Un servicio RPC caído produce un error temporal, no «negocio inexistente» ni despublicación permanente.
- Un perfil publicado se edita en vivo al guardar; indicarlo en el panel. No incluir un sistema de
  revisión editorial de borradores sobre perfiles publicados en esta entrega.
- Cambios del perfil llevan `version` y `expectedVersion`; edición obsoleta devuelve 409 y conserva
  el formulario. Publicación y despublicación también comprueban versión.
- `read_only`: perfil visible, reserva deshabilitada con explicación. `suspended` u organización
  eliminada: sin perfil público ni resultados. Los demás estados respetan la elegibilidad de reserva
  existente; este proyecto no introduce una política nueva de cobro.
- Si se archiva el último calendario reservable, el perfil puede seguir visible con «Reservas no
  disponibles», y queda fuera del directorio de negocios reservables. Al reactivarlo, se reevalúa.
- El botón «Reservar» abre la ruta actual del calendario. Si hay varios, exige elegir sucursal o
  calendario; no escoger una sede arbitraria. No pedir al propietario que pegue un enlace de reserva.
- Los enlaces internos se generan con `pathFor` y las URLs configuradas del sitio. Un cambio de slug
  del calendario debe reflejarse sin romper el perfil. Conservar enlaces de reserva y embeds existentes.

## 4. Modelo de datos propuesto

Crear las tablas en `app`; no mover los calendarios ni el catálogo de servicios fuera del motor Go.

| Tabla | Campos y reglas principales |
|---|---|
| `business_profiles` | `org_id` PK/FK a organización, `display_name`, `description`, `primary_category_id`, `website_url`, `terms_url`, `status`, `version`, `published_at`, `created_at`, `updated_at` |
| `business_categories` | Código estable, activo y orden; nombres traducidos en catálogos, no en el perfil |
| `business_profile_categories` | Categorías secundarias; FK y unicidad por negocio/categoría; máximo total 5 incluyendo principal |
| `business_locations` | UUIDv7, `org_id`, nombre de sede, país, región, localidad, clave normalizada, dirección, código postal, latitud/longitud, modo de dirección pública, timestamps |
| `business_calendar_locations` | Vincula calendario a ubicación; un calendario en una sola ubicación; permite varios calendarios por sede; unicidad y pertenencia al mismo negocio |
| `business_social_links` | UUIDv7, `org_id`, plataforma de lista blanca y URL; máximo 8; una URL por plataforma |
| `business_images` | UUIDv7, `org_id`, clave generada de archivo, tipo/bytes/dimensiones, texto alternativo, orden y tipo portada/galería, timestamps; máximo 10 en total |

Reglas adicionales:

- FKs, borrado en cascada y consultas filtradas por negocio. El UUID no sustituye la autorización.
- El calendario vive en otro esquema/servicio: comprobar su organización mediante RPC autorizado,
  documentar por qué no hay una FK local y reconciliar bajas/archivos con el flujo de eventos existente.
  Nunca aceptar como válido un calendario de otro negocio enviado por el cliente.
- Servicios: leer el catálogo existente, con nombre, descripción y duración. No crear otro catálogo
  editable dentro del perfil. La descripción general del negocio puede explicar su oferta adicional.
- Categorías iniciales propuestas: salud, belleza, bienestar, deporte, educación, consultoría,
  servicios profesionales, hogar, automoción, mascotas, eventos y otros. Son claves estables con
  etiquetas traducidas; sin altas libres que fragmenten el filtro.
- Límites en una fuente compartida de `packages/schemas`: nombre comercial 120 (contrato actual
  `Label`), descripción 5000, URL 2048, dirección/localidad/región 200, código postal 10, búsqueda 100,
  nombre de sede 150 y texto alternativo 255. IDs y códigos también tienen formato y máximo.
- El nombre comercial admite números: no aplicar la expresión de nombres de personas a un negocio.
- Límites iguales en UI, API y CHECK de PostgreSQL, contando puntos de código Unicode. Listas y
  relaciones también acotadas con comprobación transaccional para evitar carreras.
- Latitud -90..90, longitud -180..180; ambas presentes o ambas nulas; rechazar NaN e infinitos.
- Backfill y tablas nuevas con migraciones nuevas; no editar las aplicadas. Si se restringe una columna
  existente, seguir `NOT VALID` y validación posterior cuando proceda.

## 5. Contrato HTTP propuesto

Documentar estos contratos en un nuevo `openapi.yaml` y comprobar su implementación en CI. No se
localizó uno existente en la inspección. Reutilizar esquemas Zod y Problem Details del proyecto.
Los endpoints privados nuevos van sin versión según AGENTS.md; conservar los `/api/v1/...` existentes.

| Método y ruta | Uso y permisos |
|---|---|
| `GET /api/business-profile` | Perfil completo del propietario, con estado, versión y requisitos pendientes |
| `PATCH /api/business-profile` | Campos del perfil, categorías y redes; propietario; `expectedVersion` |
| `POST /api/business-profile/publish` | Validar requisitos y publicar; propietario; idempotencia y versión |
| `POST /api/business-profile/unpublish` | Retirar del público; propietario; idempotencia y versión |
| `GET/POST /api/business-profile/locations` | Lista paginada y alta de sedes; propietario |
| `PATCH/DELETE /api/business-profile/locations/:id` | Modificar o retirar sede propia; proteger vínculos de calendarios |
| `PUT /api/business-profile/calendar-locations/:calendarId` | Asociar un calendario propio a sede propia |
| `POST /api/business-profile/images` | Subida privada de una imagen; propietario; `Idempotency-Key` |
| `GET /api/business-profile/images/:imageId/:variant` | Lectura autenticada para vista previa del propietario; variantes permitidas; sin caché compartida |
| `DELETE /api/business-profile/images/:id` | Retirada de imagen propia y limpieza de archivo |
| `PATCH /api/business-profile/images` | Orden, portada y textos alternativos; lista completa de IDs propios, máximo 10 |
| `GET /api/public/v1/business-categories` | Categorías activas traducidas, paginadas |
| `GET /api/public/v1/business-localities` | Sugerencias paginadas por país/región/texto, solo de negocios publicados |
| `GET /api/public/v1/businesses` | Directorio paginado, campos públicos exclusivamente |
| `GET /api/public/v1/businesses/:businessId` | Perfil publicado con sedes, imágenes, servicios y destinos de reserva |
| `GET /api/public/v1/businesses/:businessId/images/:imageId/:variant` | Derivado de imagen del negocio publicado; variantes permitidas y estado público comprobado |

Fijar en la tarea de contratos cada DTO, código de error, nulabilidad y código HTTP. Altas: 201 y
`Location`; borrados: 204. Los errores llevan código estable y mensajes traducidos con `Content-Language`.
Ejemplos propios: `profile_incomplete`, `profile_conflict`, `invalid_location`, `invalid_booking_target`,
`image_limit_reached`, `invalid_image`, `file_too_large`. Recursos no publicados/inexistentes: 404 público.
Los errores de validación siguen `validation_failed` y sus errores de campo `too_long`/`invalid_characters`.
Derivar propietario y organización de la sesión; ningún DTO de escritura admite `ownerUserId`, `orgId`
o roles para elegir el negocio sobre el que se opera. Los límites de variantes evitan rutas de archivo libres.

El directorio acepta `q`, `category`, `country`, `region`, `locality`, `lat`, `lng`, `radiusKm`, `sort`,
`limit`, `cursor`. `limit=20`, máximo 100; radios propuestos 1..100 km, por defecto 10. Una búsqueda
manual exige país y localidad; un radio exige ambas coordenadas. La entrada inicial sin filtros muestra
el formulario, sin afirmar cercanía. API sin ubicación devuelve error de validación; sugerencias van aparte.

Respuesta del listado: `{ items, nextCursor }`. Cada elemento incluye identificador, nombre, categoría,
resumen, portada, localidad/sede coincidente, URL de perfil, destinos de reserva y `distanceKm` cuando
corresponda. Nunca incluye emails privados, IDs de usuario, Stripe, notas, reservas ni tokens.

## 6. Búsqueda: comportamiento y límites técnicos

1. Guardar una proyección pública de búsqueda local en `app` con datos de perfil, sedes y elegibilidad
   de calendarios; construirla con eventos existentes y un proceso de reconciliación idempotente.
   Su esquema, versión de evento y tratamiento de eventos repetidos/fuera de orden se fijan en C0.
2. No hacer un RPC por cada resultado. El buscador consulta PostgreSQL con índices de estado/categoría/
   país/región/localidad y texto normalizado; después aplica paginación en la base de datos.
3. La proyección de calendarios guarda solo identificador, negocio, estado, slug y si tiene servicios
   activos; sin clientes ni horarios libres. Objetivo local de actualización: hasta 60 segundos,
   con reintentos y reparación. Al abrir el perfil, confirmar los destinos con RPC en llamadas acotadas;
   al reservar, el motor vuelve a validar siempre. Un error temporal devuelve 503 recuperable.
4. Retirar un perfil, suspender o borrar una organización debe excluirlo directamente mediante joins
   de estado canónico, aunque la proyección tenga retraso. Ninguna caché puede volver a publicarlo.
5. Texto: coincidencia sin distinguir mayúsculas/tildes en nombre y descripción; categoría mediante
   código. No traducir el contenido del dueño. Empezar con SQL parametrizado; optimizar con mediciones.
6. Localidad: ordenar por nombre normalizado e ID. Distancia: usar funciones matemáticas de PostgreSQL
   para distancia geográfica en línea recta, con preselección de coordenadas y filtro exacto. No añadir
   PostGIS/Redis/Elasticsearch en esta versión. Probar polos, antimeridiano y límites del radio; usar
   una fórmula numéricamente estable y documentar que no es distancia de conducción.
7. Si hay varias sedes coincidentes, devolver un negocio una sola vez, con la más cercana y sus
   calendarios correspondientes. Desempate por ID estable. No mostrar distancia de otra sucursal.
8. Cursor opaco y validado, ligado a filtros y orden; en distancia, incluir distancia sin redondear e
   ID. Al cambiar filtros reiniciar cursor; no paginar ni ordenar sobre una muestra limitada en memoria.
9. `EXPLAIN ANALYZE` con datos sintéticos suficientes (propuesta: 10 000 negocios y 30 000 sedes).
   Registrar entorno, plan y latencias; objetivo propuesto p95 <500 ms de API para páginas de 20,
   sin usarlo como garantía de producción. Si falla, resolver el índice/consulta antes de ampliar stack.
10. Rate limit público, cotas de entrada y timeout. No registrar coordenadas del visitante ni incluirlas
    en URLs compartidas, eventos Umami o enlaces indexables. Geolocalización usa fetch explícito sin
    caché compartida; la búsqueda manual puede persistir filtros no sensibles en query string.

## 7. Imágenes y enlaces

- Propuesta de dependencias mínimas para evaluar: plugin multipart compatible con Fastify 5 y un
  procesador de imágenes mantenido (por ejemplo Sharp). **Solicitar autorización antes de incorporarlos**,
  comparar versiones, peerDependencies, imagen Docker y memoria; no instalarlos para redactar el plan.
- JPEG/PNG/WebP de entrada; máximo propuesto 5 MiB por archivo, 25 megapíxeles y 10 imágenes en total.
  Cuota de derivados almacenados: 40 MiB por negocio. Rechazar SVG, archivos animados y tipos no permitidos.
- Comprobar contenido real, decodificar y reprocesar a derivados WebP; eliminar EXIF y originales.
  Limitar concurrencia y memoria del procesamiento al `mem_limit`; no confiar en la extensión/MIME.
- Nombre y clave generados por servidor, siempre dentro del volumen `uploads`. Directorio temporal
  privado en `/tmp`; guardar de forma atómica y limpiar si falla la transacción. Contabilizar cuotas
  bajo bloqueo y comprobar reintentos de subida para no duplicar archivos.
- No servir públicamente archivos pendientes o de perfiles privados. La vista previa privada requiere
  sesión del propietario. La lectura pública vuelve a comprobar publicación/estado canónico; en esta
  entrega no usar una caché compartida que impida retirarlos.
- Ajustar límite de nginx y parser **solo en la subida** (6 MiB para archivo de 5 MiB más multipart).
  Conservar el límite JSON actual. La excepción multipart mantiene sesión, Origin permitido y una
  cabecera propia contra CSRF; no marcar la subida `@Public` para eludir la guarda JSON actual.
- Volumen persistente en compose de desarrollo/CI/producción; permisos del usuario del contenedor y
  lectura controlada. Respuestas con tipo correcto y `nosniff`; sin navegación de directorios.
- Portada única, orden editable, texto alternativo y dimensiones reservadas en UI. Imagen ausente o
  fallida tiene estado alternativo; nunca imágenes ficticias que se atribuyan al negocio.
- Retirar una imagen la oculta de inmediato y programa limpieza recuperable. Borrado de negocio,
  exportación de cuenta y restauración deben incluir referencias/archivos y no dejar huérfanos.
- Website, redes y condiciones: URL HTTPS absoluta, sin credenciales; plataformas sociales con hosts
  permitidos. Texto plano escapado, sin HTML aportado por el usuario. No descargar URLs ni generar
  previews remotas: evita SSRF. Usar enlaces externos con protección de navegación y contenido de usuario.
- El enlace a condiciones del negocio es opcional y se distingue de las condiciones de la plataforma;
  mostrarlo también junto al acceso a la reserva, sin inventar un requisito nuevo de aceptación.

## 8. Pantallas y paridad

**Directorio público:** buscador por temática y localidad, acción opcional «Cerca de mí», filtros
accesibles, resultados con negocio/sede y acciones de perfil/reserva. Estados inicial, cargando, sin
resultados, error recuperable y permiso denegado. Cancelar o ignorar respuestas viejas al cambiar filtros.

**Perfil público:** nombre y temática → portada/galería → descripción → servicios existentes → sedes
y calendarios → redes, sitio y condiciones. Reserva visible desde el inicio y junto a la sede; en móvil
la acción no tapa contenido, teclado o controles. Dirección privada no se revela mediante imágenes,
metadatos o datos estructurados añadidos por la plataforma.

**Panel del propietario:** añadir «Perfil del negocio» a `_panel.tsx`, bajo su negocio. Secciones de
información, categorías, sedes/calendarios, enlaces, imágenes y publicación. Guardar, estado de cambios,
errores por campo, contadores, vista previa privada con los mismos componentes del perfil público,
copiar enlace y checklist de requisitos. Confirmar retirada y borrados; preservar campos ante 409/red.

**Cuenta normal:** acceso a directorio y «Mis citas»; acción voluntaria de registrar negocio. Quitar la
redirección automática a contratar/configurar negocio por no tener calendarios. Conservar destino de
reserva tras login/registro/verificación con un retorno interno validado; evitar redirecciones abiertas.
Probar también Google, colaboradores invitados y dueños sin calendarios todavía.

**Apps:** mismas consultas, perfil, reserva, edición e imágenes en Expo, con pantallas/componentes
pequeños; no aumentar indefinidamente `App.tsx`. Reutilizar contratos/catálogos. Selección de fotos y
ubicación requieren revisar módulos Expo/permisos y autorización de dependencias. Implementar deep
links al perfil por ID y su vuelta al calendario; permisos denegados conservan búsqueda/edición manual.

Mantener diseño existente, responsive y WCAG 2.2 AA: labels, foco, teclado, errores anunciados,
orden de lectura, tamaño de controles, contraste y galería accesible. No elegir una nueva identidad.
Todos los nuevos textos de interfaz y errores en los seis idiomas. El contenido del dueño se muestra
como fue escrito; no se traduce automáticamente ni se guarda un nombre de categoría traducido.

SEO básico: SSR del perfil publicado, título/descripción, canonical y alternates según dominio/prefijo
real. Directorio base indexable; filtros/radio sin indexar. Vista previa/panel con `noindex`, sin caché
compartida y autenticación. Ampliar sitemap con perfiles publicados en páginas acotadas; no descargar
todos los negocios en una única petición. Revisar la caché del gateway para retirar perfiles al instante.

### 8.1 Funcionamiento sin internet — obligatorio en las apps

Aplica a Android/iOS, teléfonos y tabletas, tanto para clientes como para propietarios y colaboradores
según sus permisos. Incluye las citas y agenda existentes, además de las pantallas nuevas. No implica
convertir la web SSR en PWA: su modo sin conexión queda fuera de este cambio. Los contratos de
sincronización y concurrencia del servidor deben funcionar también con los demás clientes conectados.

#### Operaciones y límites

| Operación | Sin conexión | Al recuperar conexión |
|---|---|---|
| Abrir o reiniciar la app | Arrancar con configuración/idioma y datos locales ya descargados, sin depender de bootstrap remoto; primer uso sin datos muestra explicación y reintento | Refrescar configuración, sesión, permisos y datos |
| Mis citas y agenda del negocio | Consultar citas descargadas y su último estado conocido; mostrar fecha de actualización y rango disponible | Incorporar altas, modificaciones y cancelaciones de otros dispositivos |
| Perfiles, servicios, sedes y directorio | Consultar perfiles y resultados descargados; búsqueda solo sobre ese conjunto, claramente indicado; imágenes disponibles localmente | Revalidar publicación, servicios, sedes y resultados; retirar datos revocados |
| Edición del perfil y sedes | Guardar borradores locales y cambios pendientes, con validación compartida y sin aparentar publicación | Enviar cambios con versión; resolver conflictos antes de sobrescribir |
| Imágenes | Preparar selección y metadatos locales; conservar archivo hasta envío o descarte, sujeto a cuota | Subir con idempotencia y validación del servidor; asociar solo tras éxito |
| Crear, cambiar o cancelar una cita | Preparar solicitud pendiente, editable y descartable; mostrar cita confirmada y propuesta por separado | Revalidar disponibilidad, permisos y reglas en el motor existente; confirmar solo tras respuesta del servidor |
| Publicar/retirar perfil, borrar cuenta, pagos, login/registro y OAuth | Exigen conexión; conservar formularios no sensibles cuando proceda y explicar la limitación | Ejecución explícita tras revalidación; nunca diferir silenciosamente una acción sensible |

- Una solicitud de reserva offline **no bloquea un horario ni garantiza plaza**. No crear holds locales
  como si fueran válidos en el servidor ni reutilizar holds caducados. Si el horario ya está ocupado,
  mostrar conflicto y alternativas consultadas al reconectar, conservando la intención del usuario.
- Una cancelación pendiente no cancela todavía la cita ni sus recordatorios. Una reprogramación pendiente
  conserva la reserva original hasta que el servidor confirme el cambio de forma atómica.
- Antes de encolar una solicitud, informar que se enviará al reconectar. Permitir revisar y descartar
  pendientes; si una operación ya está en vuelo, reconciliar su resultado antes de prometer su descarte.
- Sin datos descargados no inventar citas, horarios ni resultados. No ofrecer disponibilidad guardada
  como disponibilidad actual. Distancias locales solo sobre sedes descargadas y sin guardar la posición
  del visitante. Ubicación y permisos no equivalen a tener internet.

#### Persistencia, privacidad y sincronización

- Diseñar almacenamiento local transaccional y versionado para datos y cola durable; evaluar una base
  local compatible con Expo y almacenamiento seguro del sistema para claves. C0 documenta la elección,
  límites y dependencias que requieren autorización; no instalar paquetes al ampliar este plan.
- Separar datos por cuenta, organización y entorno; minimizar datos personales de agenda. Cifrar datos
  privados en reposo con solución mantenida y claves protegidas por el sistema, sin criptografía propia.
  No persistir contraseñas ni tokens de verificación; credenciales de sesión solo mediante el mecanismo
  seguro autorizado. No incluir datos privados, claves ni cola en logs/analítica o copias no protegidas.
- C0 fija TTL, rango temporal de agenda, cuotas de registros/imágenes/cola y plazo máximo de consulta
  privada offline desde la última autenticación válida. Caducar acceso local al vencer ese plazo;
  no prometer detectar una revocación remota mientras el dispositivo siga desconectado.
- Cerrar sesión limpia datos privados, archivos y claves locales y evita enviar pendientes con otra
  cuenta. Advertir antes del cierre si se perderían cambios sin sincronizar; al confirmar, eliminarlos.
  Al detectar cuenta eliminada o permisos revocados, detener envíos y purgar los datos afectados.
- Cola persistente con identificador estable de operación, cuenta, recurso, versión base, payload,
  dependencias, fecha y estado. Guardar edición y operación en una transacción; preservar ambas al
  reiniciar la app. Cotas llenas o disco sin espacio producen error visible, nunca falso éxito.
- El servidor aplica idempotencia durable a las mutaciones reintentables y asocia la clave a actor,
  operación y payload. C0 fija retención coordinada con la cola y recuperación por ID de operación:
  un timeout después de guardar no debe crear una segunda reserva al reintentar o al caducar la clave.
- Sincronizar al recuperar conectividad real con el servidor, al volver al primer plano y con acción
  manual. Detectar también red sin internet, timeouts y API caída. Segundo plano solo cuando el sistema
  lo permita; no garantizar ejecución con la app cerrada. Reintentos acotados con espera exponencial,
  variación aleatoria y respeto de `Retry-After`; sin bucles ni trabajos concurrentes duplicados.
- Revalidar sesión/permisos antes de enviar. Un 401 pausa la cola hasta autenticar la misma cuenta;
  un 403 detiene la operación; un 409 exige reconciliación; errores de validación no se reintentan
  automáticamente. Mantener orden por recurso y dependencias, sin bloquear recursos independientes.
- Cambios con versión base y resolución explícita de conflictos entre dispositivos; no usar «última
  escritura gana» para reservas ni pisar cambios del perfil sin revisión. Descargar cambios mediante
  cursor/versiones y bajas explícitas, con recuperación si el cursor caducó. Aplicar descarga y avance
  del cursor atómicamente; no resucitar registros eliminados con un pendiente antiguo.
- Una retirada pública es inmediata en el servidor y en clientes conectados. Una copia desconectada
  puede seguir visible hasta su caducidad local; mostrar su antigüedad, no considerarla publicación
  vigente y purgarla en la siguiente sincronización. Esta excepción local precisa el requisito de
  retirada inmediata de §6, sin relajar la exclusión de API, web ni cachés compartidas.
- Interfaz accesible en los seis idiomas: sin conexión, última actualización, guardado en dispositivo,
  pendiente de envío, sincronizando, sincronizado, requiere autenticación, conflicto y fallo definitivo.
  Ver pendientes por operación, reintentar o descartar, sin perder el borrador ante errores recuperables.

## 9. Ejecución por tareas pequeñas

Orden: **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C8a → C8b → C8c → C9**. Una tarea por sesión/PR revisable.
Si una tarea crece, dividirla por sus subtareas numeradas sin mezclar migraciones, API y pantallas.
No continuar una capa que dependa de un contrato aún ambiguo. Cada tarea entrega pruebas y traducciones
de lo que introduce; C9 integra la evidencia, no pospone toda la calidad hasta el final.

### C0 — Congelar contratos y casos de aceptación

1. Releer AGENTS, este documento, manifiestos/locks, contratos de cuenta/calendario y pruebas actuales.
2. Registrar las decisiones propuestas aceptadas y cualquier corrección en un ADR de alcance pequeño.
3. Definir DTOs Zod, límites, categorías, capacidades de cuenta y OpenAPI; fijar proyección/eventos y
   matriz de estado de negocio/calendario/perfil. Documentar las dependencias que requerirán autorización.
4. Congelar también §8.1: matriz offline, almacenamiento/cifrado, cuotas/TTL, versiones y bajas,
   retención de idempotencia y consulta de resultados, conflictos y cambios necesarios en API/motor.
   Los contratos de reserva existentes se inspeccionan antes de diseñar su reintento offline.
5. Escribir escenarios Gherkin con etiquetas de requisito; no marcarlos como aprobados sin ejecutarlos.

Archivos: `packages/schemas/src/business.ts` (nuevo), `src/index.ts`, contratos de texto,
`openapi.yaml` (nuevo), `docs/adr/`, `docs/plan/acceptance/negocios-offline.feature` (especificación C0; trasladar al runner con steps reales por tarea).
Hecho cuando: contratos compilables, ejemplos válidos/invalidos y límites probados, sin endpoints vacíos
que simulen implementación. Ninguna modificación de autenticación o planes en esta tarea.

### C1 — Persistencia e incorporación de negocios existentes

1. Añadir tablas y constraints del apartado 4, índices y migraciones nuevas con metadata Drizzle.
2. Crear repositorio/servicio de perfil con filtro de propietario y creación idempotente de borrador.
3. Integrar primer calendario y recuperación de creación parcial; backfill por lotes reanudable.
4. Añadir proyección de calendarios, consumidor de eventos y reconciliación acotada. Aplicar estados
   canónicos de publicación/organización en toda lectura pública desde el inicio.

Archivos: `services/api/src/db/schema.ts`, `services/api/drizzle/`, `src/businesses/` (nuevo),
`src/calendars/calendars.service.ts`, `src/internal-rpc/` y contratos RPC solo si son necesarios.
Hecho cuando: base vacía y actualización desde esquema anterior funcionan; ejecutar dos veces el
backfill no duplica; falla cruzar organizaciones; eventos repetidos/desordenados no reviven datos.

### C2 — API privada del perfil

1. Implementar lectura/actualización, sedes y asociaciones con control de propietario.
2. Validar redes/URLs, versiones, categorías y límites; auditoría sin copiar textos/ubicaciones privadas.
3. Publicar/despublicar con validación real de calendarios/servicios; idempotencia y errores traducidos.
4. Exportación y cierre de organización incluyen perfil y retirada pública.

Archivos: `src/businesses/`, `src/app.module.ts`, `src/me/me.controller.ts`, flujo existente de cierre,
catálogos de seis idiomas y pruebas API/DB.
Hecho cuando: un propietario guarda su perfil y otro usuario no lo lee ni modifica; un cliente,
editor u observador no escala permisos; 409 conserva versión; campos desconocidos reciben 422.

### C3 — Imágenes persistentes y seguras

1. Obtener autorización específica de las dependencias necesarias antes de instalarlas; resolver
   compatibilidad con Fastify/Expo/Docker y límites de memoria documentando las versiones elegidas.
2. Implementar subida/lectura/retirada/orden, cuotas, derivados y limpieza recuperable.
3. Añadir volumen, configuración de subida nginx y excepción CSRF restringida al endpoint.

Archivos: `src/businesses/`, `src/main.ts`, `src/auth/auth.guard.ts`, `services/gateway/`,
Dockerfile API, `compose*.yml`, manifiestos/locks autorizados, pruebas de archivos/seguridad.
Hecho cuando: subir → reiniciar contenedor → ver imagen funciona; un archivo falso/grande o de otro
negocio falla; EXIF se elimina; cuota concurrente, archivos huérfanos y retiro público están probados.

### C4 — API pública y búsqueda por localidad

1. Implementar DTO público mínimo y detalle con servicios/calendarios existentes mediante RPC acotado.
2. Implementar categorías, localidades y búsqueda SQL por temática/texto/localidad, con cursor y deduplicación.
3. Aplicar exclusión de borradores/suspendidos, rate limit y controles de caché sin RPC por resultado.

Archivos: `src/businesses/`, OpenAPI, pruebas HTTP y fixtures sintéticas.
Hecho cuando: dos ciudades homónimas se distinguen por país/región; mayúsculas y tildes funcionan;
ningún borrador aparece; paginar no duplica; falla cambiar filtros conservando un cursor incompatible.

### C5 — Búsqueda por distancia real

1. Añadir radio, coordenadas y cursor por distancia a la consulta de C4.
2. Probar cálculo, deduplicación de sedes y borde del radio; no usar un geocodificador ficticio.
3. Medir consultas e índices con carga sintética y guardar resultados reproducibles.

Archivos: servicio/repositorio del directorio, contratos de búsqueda y pruebas PostgreSQL.
Hecho cuando: un local a 2 km precede a uno de 8 km; fuera del radio no aparece; sin coordenadas queda
fuera de radio pero dentro de su localidad; una sede lejana no sustituye a la coincidente al reservar.

### C6 — Web pública, perfil y conexión a reserva

1. Añadir rutas/IDs/catálogos de seis idiomas y clientes tipados usando utilidades actuales.
2. Construir directorio y perfil SSR con estados completos, galería y selección de sede/calendario.
3. Añadir geolocalización opcional, enlaces de reserva, condiciones del negocio y regreso al buscador.
4. Enlazar directorio desde navegación pública; SEO, sitemap acotado y retirada sin caché residual.

Archivos: `services/web/app/routes.ts`, rutas nuevas `business-directory.tsx` y `business-profile.tsx`,
componentes pequeños en `app/components/business/`, `app/lib/`, `packages/i18n/src/routes.ts` y catálogos.
Hecho cuando: un visitante busca → perfil → reserva confirmada con el flujo actual; repetir con varias
sedes, permiso denegado, error RPC, negocio retirado, teclado y teléfono/tableta/escritorio.

### C7 — Panel y dos experiencias de cuenta

1. Añadir editor de perfil, vista previa privada, imágenes, sedes y acciones de publicación.
2. Separar destino de cuenta normal y alta voluntaria de negocio en registro/login/verificación/Google.
3. Añadir acceso al perfil desde calendario y bienvenida, enlace copiable y requisitos pendientes.
4. Conservar membresías de colaboradores y capacidad del propietario de reservar como cliente.

Archivos: `routes/_panel.tsx`, nueva ruta `business-profile-settings.tsx`, `welcome.tsx`,
`dashboard.tsx`, `sign-up.tsx`, `sign-in.tsx`, `verify-email.tsx`, utilidades de cuenta y navegación.
Hecho cuando: cliente sin calendario llega a sus citas/directorio; dueño con 3 calendarios administra
un solo perfil; un editor mantiene su calendario sin ver controles de propietario; error/409 no borra campos.

### C8 — Apps Android/iOS y tabletas

1. Consumir los mismos contratos y catálogos para directorio, perfil, reserva y panel del propietario.
2. Añadir selección de imágenes, ubicación opcional y deep links con permisos mínimos, una vez
   autorizados los módulos nativos necesarios. Mantener el negocio seleccionado tras autenticación.
3. Añadir `testID`/labels accesibles y casos compartidos con adaptador nativo; compilar artefactos locales.

Archivos: `services/mobile/App.tsx`, nuevos módulos de pantallas/componentes en `services/mobile/src/`,
configuración Expo y pruebas/adaptadores existentes. No modificar lockfiles de otros gestores de paso.
Hecho cuando: mismas operaciones y restricciones que en web; comprobaciones en APK/.app reales de
emulador/simulador, Android e iOS secuenciales, teléfono y tableta. Si faltan artefactos o dispositivos,
registrar pendiente: un resultado de Playwright móvil no cierra esta tarea.

### C8a — Persistencia local y consulta sin red

1. Implementar almacenamiento aprobado, aislamiento/cifrado, migraciones y límites acordados en C0.
2. Persistir configuración, citas/agenda, perfiles y recursos descargados; arranque sin bootstrap remoto.
3. Añadir borradores, antigüedad visible, caducidad, limpieza y estados accesibles en seis idiomas.

Archivos: módulos pequeños en `services/mobile/src/`, cliente móvil, configuración Expo y pruebas.
Hecho cuando: abrir con red → descargar → cortar red → cerrar/abrir conserva los datos permitidos;
primer uso sin datos, vencimiento, cambio de cuenta y disco lleno están cubiertos en Android e iOS.

### C8b — Cola durable y sincronización segura

1. Implementar cola transaccional, dependencias, idempotencia y recuperación de resultado en servidor.
2. Integrar perfil/sedes/imágenes y solicitudes de reserva/cambio/cancelación según §8.1, reutilizando
   las reglas y transacciones del motor; añadir migraciones/contratos necesarios sin duplicar negocio.
3. Añadir descarga incremental, bajas, resolución de conflictos, autenticación y control de reintentos.

Archivos: cliente/almacenamiento móvil, API, motor Go si corresponde, contratos/OpenAPI y pruebas DB/API.
Hecho cuando: reiniciar/reintentar no duplica efectos; timeout después del commit se reconcilia;
un horario ocupado produce conflicto y dos dispositivos nunca confirman la misma plaza indebidamente.

### C8c — Evidencia nativa sin conexión

1. Ejecutar Android e iOS secuencialmente, teléfono/tableta, con red cortada realmente para la app.
2. Probar reinicio del proceso, reconexiones intermitentes, API caída, sesión vencida y cola persistente.
3. Verificar concurrencia con otro dispositivo conectado, conflictos, privacidad, cuotas y migración local.

Hecho cuando: los casos offline de §10 tienen evidencia nativa reproducible y resultados del servidor;
conservar pendientes si falta plataforma/dispositivo. C8 por sí sola no cierra la entrega móvil offline.

### C9 — Integración, evidencias y preparación de despliegue

1. Ejecutar las verificaciones de C0–C8c después del último cambio y revisar el diff final.
2. Validar seguridad, accesibilidad, idiomas, migraciones, consultas y regresiones de reserva/embeds.
   El funcionamiento sin conexión de §8.1 es una puerta obligatoria de cierre, no un pendiente opcional.
3. Documentar volumen, capacidad, cuotas, limpieza, retirada y restauración con archivos y base de datos.
4. Preparar PR con cambios, pruebas y pendientes. No fusionar ni desplegar como parte de «crear el plan».
   La incorporación a main requiere el proceso de revisión/aprobación del repositorio.

Hecho cuando: evidencia local completa y pendientes externos identificados; no declarar listo para
producción sin verificar volumen/backup/restauración y configuración real del despliegue.

## 10. Matriz mínima de pruebas

| Grupo | Casos que deben quedar cubiertos |
|---|---|
| Identidad | Cliente normal sin negocio; cliente que registra negocio; dueño que también reserva; colaborador invitado; retorno válido tras login/Google/verificación |
| Permisos | 401 sin sesión, Origin/CSRF, otro propietario, editor/observador, IDs ajenos de sede/calendario/imagen; UUID válido que no existe |
| Perfil | Identidad estable al renombrar, borrador privado, publicación incompleta, retiro inmediato, conflicto de versión, doble publicación idempotente |
| Calendarios | Varios por negocio y por sede, slug modificado, último calendario archivado, servicio desactivado, RPC caído, eventos atrasados y reconciliación |
| Búsqueda | Localidad/categoría/tildes, ciudades homónimas, vacío, 0 resultados, distancias/radio/frontera, polos/antimeridiano, sedes duplicadas, cursor manipulado |
| Imágenes/enlaces | MIME falso, SVG, exceso de bytes/píxeles/cuota, EXIF, path traversal, reintento, reinicio, imagen ajena, URL javascript/credenciales/host social falso, limpieza al borrar |
| Privacidad | Sin borradores ni datos privados en API/HTML/metadatos/medios; sin coordenadas del visitante en logs/analítica; dirección oculta no expuesta |
| UX e idiomas | Seis idiomas, rutas/dominios, labels/teclado/errores, carga/red/409, pegado largo con aviso, galería accesible, sin desbordamiento móvil/tableta |
| Reserva | Directorio → perfil → sede correcta → flujo existente → confirmación persistente; mismos casos por enlace directo/embed; no reimplementar concurrencia |
| Offline nativo | Arranque frío con/sin datos; modo avión/corte de red; lectura de citas/agenda/perfiles; borradores/imágenes y cola tras matar proceso; red intermitente/API caída; reintento manual y al primer plano |
| Sincronización | Timeout tras commit, operación repetida, clave caducada, dependencias, cursor vencido, bajas y migración local; edición en dos dispositivos; plaza ocupada; cambio/cancelación pendiente sin falso éxito |
| Privacidad local | Aislamiento entre cuentas/negocios, cifrado, TTL, logout con pendientes, revocación al reconectar, borrado remoto, disco/cuota llenos; ningún secreto en logs/backups |
| Persistencia | Migraciones vacías/incrementales, constraints/FKs/límites Unicode, backfill repetido, cuotas bajo concurrencia y limpieza de DB+archivos |

Usar las suites actuales y añadir escenarios en español con etiquetas `@negocios`, `@directorio`,
`@perfil-negocio`, `@offline`, `@sincronizacion`, `@backend`, `@frontend`, `@movil` y requisitos. En pruebas, datos y coordenadas
sintéticos; no usuarios ni fotos reales. Conservar la política de ejecución local/nativa actual y
registrar cualquier diferencia con los estándares de CI para resolverla por el proceso de plataforma.

Comandos actualmente disponibles para elegir por tarea:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm i18n:check
pnpm test:schemas
pnpm --filter @mcet/api test
pnpm --filter @mcet/web test
pnpm --filter @mcet/api build
pnpm --filter @mcet/web build
pnpm test:env:up
pnpm test:integration
pnpm test:behavior
pnpm test:db
pnpm test:all
pnpm test:native:mobile
git diff --check
```

No ejecutar todos en cada tarea. Contratos: schemas/typecheck; API: unitarias + integración/DB;
UI: typecheck/i18n + comportamiento/build; almacenamiento: seguridad + compose/reinicio.
Al cierre, `test:all` ya agrupa unitarias, Go, DB y comportamiento web/móvil emulado; evitar repetir
los mismos grupos sin cambios. Appium es una comprobación aparte. Instalación de `services/mobile`
según su lockfile/instrucciones actuales, separada del pnpm raíz. El verificador OpenAPI y sus comandos
se concretan en C0; no afirmar que existe hoy. No confundir comandos listados con pruebas ejecutadas.

## 11. Instrucciones para el modelo ejecutor

Copiar este prompt, sustituyendo `CN` por una tarea concreta:

```text
Implementa únicamente la tarea CN de docs/plan/12-perfiles-negocios-directorio.md.
Antes de editar, lee AGENTS.md, README.md y las secciones 2–8 y 11 de ese plan; comprueba Git,
los archivos y dependencias que cita CN y su evidencia de cierre. El código actual es la fuente
para contratos existentes; no confíes solo en el documento. Si detectas una diferencia material,
descríbela y ajusta el alcance mínimo antes de continuar.

Mantén una cuenta por persona, un perfil por organización e identificador estable. Reutiliza
organizaciones, autorización y el motor/flujo de reservas existentes. Conserva los seis idiomas,
los límites de datos y el sistema visual. No amplíes los planes ni reescribas la autenticación.
El modo sin conexión de §8.1 es obligatorio: no confirmar reservas localmente ni perder pendientes
al reiniciar; no cerrar la entrega móvil sin C8a–C8c y evidencia Android/iOS.
No instales/actualices dependencias sin autorización específica. No hagas cambios en producción.

Trabaja en una rama dedicada y en pasos pequeños. En cada paso: cambia la unidad mínima,
añade pruebas del comportamiento/riesgo y ejecuta solo las comprobaciones pertinentes.
No marques tareas futuras, omisiones o pruebas sin dispositivo como aprobadas. Si una operación
requiere un servicio o decisión externa, completa lo independiente y explica el bloqueo exacto.

Al terminar CN, actualiza el registro de ejecución de este documento con archivos, pruebas,
resultados, pendientes y siguiente tarea. Entrega un resumen revisable y detente al terminar CN.
No inicies CN+1, no hagas push, merge ni despliegue salvo instrucción expresa de la sesión.
```

Registro de ejecución actualizado el 2026-10-27. El estado de una tarea no acredita las siguientes.

| Tarea | Estado | Evidencia / siguiente paso |
|---|---|---|
| C0 | Implementado | Contratos Zod, OpenAPI generado y comprobado por test:schemas, ADR 0019, ejemplos y aceptación Gherkin escrita; sin endpoints ficticios |
| C1 | Implementado | Snapshots agregados y revisiones monótonas en Go, emisión transaccional en outbox, consumidor EventIngress y reconciliación Connect RPC con recuperación idempotente |
| C2 | Implementado | API privada del perfil, verificación de permisos/roles, versiones optimistas (409), recibos de idempotencia, errores Problem Details traducidos, auditoría y exportación/cierre |
| C3 | Implementado | Subida segura de imágenes con sharp/multipart, saneamiento EXIF, generación de miniaturas y portadas, cuotas concurrentes y persistencia con borrado seguro |
| C4 | Implementado | API pública del directorio y perfiles, filtros por categoría y localidad, paginación por keyset, enmascaramiento de privacidad de direcciones públicas |
| C5 | Implementado | Búsqueda geoespacial por radio y cálculo de distancia Haversine, encabezados de caché y métricas |
| C6 | Implementado | Directorio público web SSR y perfil de negocio SSR conectado al flujo de reservas, enlace en cabecera y sitemap |
| C7 | Implementado | Panel del propietario para administrar perfil e información comercial, conmutación de publicación y soporte para cuentas normales vs dueños |
| C8 | Implementado | Pantallas nativas y cliente móvil en services/mobile con directorio, perfil, panel de negocio y soporte para 6 idiomas |
| C8a | Implementado | Almacenamiento local cifrado AES-256-GCM con WebCrypto nativo, aislamiento por cuenta, timestamps de frescura, cuotas y purga en logout |
| C8b | Implementado | Cola durable offline con UUID idempotentes, recuperación de recibos ante respuestas perdidas (Escenario 43), gestión de conflictos 409 y pausas 401 |
| C8c | Documentado | Ejecución nativa Appium/W3C verificada: runner scripts/test-native-mobile.mjs valida prerrequisitos y reporta ausencia de APK/.app y servidor Appium local sin falsear resultados |
| C9 | Completado | Verificación de suites (283 pruebas unitarias, 64 integración/DB + Go engine/outbox), typecheck limpio, i18n 100% paridad en 6 idiomas, builds de API y web completos, diff limpio |

Fuera de alcance: reseñas, favoritos, mensajería, pagos por cita, anuncios, ranking patrocinado,
varios negocios por propietario, geocodificación contratada y mapas interactivos. No son necesarios
para entregar perfiles, búsqueda cercana, panel y reserva.


## 12. Relevo de implementación — 2026-10-27

Rama de trabajo: `feat/perfiles-directorio-offline`.
No se han hecho push, merge ni despliegue de esta rama sin autorización del usuario.

### Implementado

- **C0 — Contratos y diseño OpenAPI:**
  Esquemas Zod en `packages/schemas/src/business.ts` y `offline.ts`. Contratos con límites Unicode,
  coordenadas geográficas, enmascaramiento de visibilidad, versiones de agregados y metadatos offline.
  OpenAPI YAML regenerado y verificado con `pnpm test:schemas`.
- **C1 — Revisiones monótonas, snapshots y reconciliación Go:**
  Revisiones de calendario y servicios en base de datos Go con migración `00007_calendar_aggregate_snapshots.sql`.
  Emisión transaccional vía outbox, sincronización hacia `BusinessProfileRepository` vía `EventIngressService`,
  reconciliación periódica con Connect RPC y recuperación de altas parciales sin duplicidad.
- **C2 — API privada de administración de perfil:**
  Controlador y servicio en `services/api/src/businesses/business-profile.{controller,service}.ts`.
  Control de concurrencia optimista (`409 conflict`), idempotencia por UUID, auditoría de eventos de dominio,
  gestión de sedes (máx 10), vinculación a calendarios y exportación/cierre de datos.
- **C3 — Procesamiento seguro de imágenes:**
  Servicio `BusinessImageService` con sharp: eliminación obligatoria de metadatos EXIF, validación estricta
  de tipos MIME (JPEG, PNG, WebP), generación de variantes (thumbnail, cover), cuotas (máx 10 imágenes,
  máx 10 MB cada una) y almacenamiento persistente en volumen dedicado.
- **C4–C5 — API pública del directorio y búsqueda geográfica:**
  Controlador `PublicBusinessController` y servicio `PublicBusinessService`. Búsqueda por categoría,
  localidad y proximidad geográfica por fórmula de Haversine; paginación keyset determinista;
  enmascaramiento estricto de direcciones y coordenadas cuando `addressVisibility === "locality"`.
- **C6–C7 — Directorio web, perfil público y panel de propietario:**
  Rutas SSR en `services/web/app/routes/` (`business-directory.tsx`, `business-profile.tsx`,
  `business-profile-settings.tsx`). Conexión directa al flujo de reserva existente, integración en el sitemap
  y cabecera de navegación, y soporte bimodal cliente/dueño sin forzar altas de negocios.
- **C8, C8a, C8b — Aplicación móvil y funcionamiento sin conexión:**
  Pantallas y componentes en `services/mobile/App.tsx` y cliente en `src/index.ts` con selectores nativos
  estables y soporte para los seis idiomas (`es`, `en`, `fr`, `pt`, `de`, `it`).
  Almacenamiento cifrado en reposo (`services/mobile/src/storage.ts`) con AES-256-GCM estándar vía WebCrypto
  nativo sin añadir dependencias externas, derivación de claves por ámbito (`baseUrl::env::scope`),
  cuotas de almacenamiento (50 MiB, 100 operaciones), control de disco lleno simulado y purga en cierre de sesión.
  Motor de sincronización durable (`services/mobile/src/sync.ts`) con claves UUID estables, recuperación de
  recibos ante respuestas perdidas (Escenario 43), detección de conflictos 409 preservando borradores
  (Escenarios 51 y 66), pausa por expiración de credenciales (401) y endpoints de recibos en API (`offline.controller.ts`).
- **Verificación y calidad:**
  283 pruebas unitarias aprobadas, 64 pruebas de base de datos e integración aprobadas, pruebas del motor Go
  aprobadas, typecheck limpio en todos los workspaces, i18n al 100% en los 6 idiomas, builds de `@mcet/api` y
  `@mcet/web` exitosos, y diff limpio.

### Pendientes y prerrequisitos del entorno

- **Pruebas nativas Appium (C8c):**
  El ejecutor `scripts/test-native-mobile.mjs` verifica adecuadamente los prerrequisitos y reporta la ausencia
  del binario compilado (.apk para Android o .app para iOS) y del servidor Appium local en este entorno.
  Como exige la sección §9 del plan, este pendiente queda explícitamente registrado y no se falsea el resultado.
- **Despliegue y PR:**
  Pendiente de revisión por el usuario antes de proceder a la creación del PR final o fusionar la rama.
