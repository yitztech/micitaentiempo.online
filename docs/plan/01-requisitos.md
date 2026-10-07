# 1. Requisitos consolidados

Este documento une, en una sola lista verificable, lo que piden el estudio técnico, el documento de
requisitos de despliegue, el `README.md` del repositorio y las indicaciones del 2026-10-06 (incluidas
las añadidas durante la redacción: MCP, frontend bilingüe y pruebas por escenarios). Si dos fuentes
chocan, manda la más reciente; los cambios están en la sección 7.

## 1.1 Fuentes

| Fuente | Qué aporta |
|---|---|
| [Estudio técnico — MiCitaEnTiempo](https://claude.ai/artifact/HKBaJdGPHFZP1wnP16M1YG) | Motor propio en Go, doble reserva impedida por PostgreSQL, colas sobre PostgreSQL, libre/ocupado, evaluación de DayOtter |
| [Requisitos de despliegue — Mi Cita en Tiempo](https://claude.ai/code/artifact/b3ce3cb9-e2d6-4db6-a2dc-c9c0046331a3) | Contrato con la plataforma: compose, workflow, dominios, variables, memoria, copias |
| `README.md` del repositorio | Resumen del contrato y reglas de trabajo (PR con aprobación de @yprevot) |
| [`yitztech/plantilla-cliente`](https://github.com/yitztech/plantilla-cliente) | Ejemplo que ya cumple el contrato: gateway nginx, workflow, cabeceras |
| Indicaciones del 2026-10-06 | Arquitectura de 4 contenedores, roles, planes, notificaciones, sincronización, embed, diseño, MCP, es/en, pruebas por escenarios |

## 1.2 Glosario

El usuario usa «cliente» con dos sentidos. En el plan se distinguen así:

| Término | Significado |
|---|---|
| **Negocio** | Quien contrata Mi Cita en Tiempo (persona o empresa). Tiene una organización y un plan |
| **Propietario** (`owner`) | Usuario que creó la organización y el tablero. Paga la suscripción |
| **Tablero** | Un calendario de reservas. Equivale a una **sucursal** en el plan Sucursales |
| **Editor** (`editor`) | Persona invitada con su cuenta de Google; crea, edita y elimina eventos del tablero |
| **Observador** (`observer`) | Persona invitada que ve todo el tablero en solo lectura y recibe avisos de cambios |
| **Cliente final** (`customer`) | Persona que reserva en un tablero. Solo ve y gestiona sus propias reservaciones |
| **Evento** | Cualquier bloque en el tablero: cita (con o sin cliente final) o bloqueo |
| **Reservación** | Cita creada por un cliente final, siempre de una en una (sin recurrencia) |
| **Evento bloqueante** | Bloqueo de tiempo creado por propietario o editor; no admite reservaciones |
| **Servicio** | Tipo de cita: nombre, duración, márgenes, antelación (p. ej., «Consulta general, 30 min») |
| **Hold** | Apartado temporal de un horario mientras el cliente final confirma (10 min) |

## 1.3 Requisitos funcionales

Cada requisito tiene un identificador que reutilizan las fases (`10-fases.md`) y los escenarios
automatizados (`09-pruebas.md`).

| Id | Requisito | Criterio de aceptación resumido |
|---|---|---|
| RF-01 | Registro de negocios con Google o con correo y contraseña | Se guarda nombre completo, correo (es el usuario) y contraseña como hash Argon2id; nunca en claro |
| RF-02 | Verificar que el correo es válido | Formato correcto, dominio con registros MX (o A/AAAA), dominio no desechable y enlace o código de verificación obligatorio antes de usar el panel. Con Google se acepta `email_verified` |
| RF-03 | Prueba gratuita de 1 mes | 30 días sin tarjeta desde el registro; avisos a 7 y 3 días; al vencer, el tablero pasa a solo lectura y deja de aceptar reservas. Mientras Stripe no esté configurado, la prueba no vence (§1.9) |
| RF-04 | Planes | **Personal** US$5/mes: 1 tablero. **Sucursales** US$20/mes: hasta 10 tableros. Solo suscripción; el cobro con Stripe se implementa completo y queda sin configurar |
| RF-05 | Primer tablero al registrarse | Asistente de alta que crea el tablero con su configuración |
| RF-06 | Bloqueos al crear el tablero | Zona horaria, horario laboral por día, descansos con nombre (desayuno, comida, otros), feriados y festivos de uno o varios países (y región), días cerrados y excepciones por fecha |
| RF-07 | Compartir y embeber | Enlace público del tablero e incrustación en cualquier landing (iframe directo o script con modos en línea, ventana emergente y botón flotante) |
| RF-08 | Editores con cuenta de Google | El propietario invita por correo; la invitación solo se acepta iniciando sesión con Google con ese mismo correo |
| RF-09 | Observadores | Ven todo el tablero en solo lectura y reciben avisos |
| RF-10 | Privacidad entre clientes finales | Un cliente final crea, edita y cancela solo sus reservaciones; nunca ve las de otros (ni en la interfaz, ni en la API, ni por MCP) |
| RF-11 | Eventos bloqueantes | Propietario y editores bloquean tiempo sin reservaciones |
| RF-12 | Eventos recurrentes | Solo propietario y editores. Edición «solo este», «este y los siguientes», «todos». Los clientes finales reservan de una en una |
| RF-13 | Avisos de cambios | Al crear, modificar, cancelar o eliminar un evento se avisa al propietario y a los observadores (y a los editores que sigan el tablero y al cliente final afectado), en el panel y por correo |
| RF-14 | Panel de configuración por usuario | Cada usuario acepta o rechaza avisos por correo, WhatsApp, Slack y Telegram; elige idioma, zona horaria y formato de hora |
| RF-15 | Sincronización con Google Calendar, Outlook y Apple Calendar | La hace el motor en Go. Por tablero (cuentas del negocio) y por cliente final (sus propias citas). Detalle en `04-motor-calendario.md` §4.9 |
| RF-16 | Frontend en español e inglés | Toda la interfaz, correos, avisos y respuestas MCP en los dos idiomas; el idioma lo decide el dominio |
| RF-17 | Móviles y tabletas | Calendarios y reservaciones usables desde 360 px de ancho, en vertical y horizontal |
| RF-18 | MCP | Los negocios conectan Claude, ChatGPT o Gemini y gestionan o consultan su sistema en lenguaje natural |
| RF-19 | Pruebas automatizadas por escenarios | Escenarios en Gherkin (español) ejecutados en CI y en local, con varios actores, ambos idiomas y varios dispositivos |
| RF-20 | Diseño fresco y culturalmente neutro | Paleta sin colores con connotaciones negativas en las culturas objetivo, sobre todo la occidental |
| RF-21 | Servicios (del estudio) | Duración, márgenes antes y después, antelación mínima, ventana máxima, intervalo de horarios, capacidad, límite diario |
| RF-22 | Recordatorios (del estudio) | 24 h y 1 h antes por defecto, configurables, en la zona horaria del destinatario |
| RF-23 | Sin marca de terceros (del estudio) | Ninguna pantalla, correo ni enlace propio muestra marcas de proveedores (salvo lo inevitable de Stripe, ver 1.8) |
| RF-24 | Fechas (README) | Instantes en UTC en la base de datos; se muestran en la zona horaria del usuario, guardada en su cuenta |

## 1.4 Requisitos no funcionales

| Id | Requisito |
|---|---|
| RNF-01 | Contrato de la plataforma completo (`08-infraestructura.md` §8.1): `compose.prod.yml`, `gateway` en el puerto 80, sin `ports:`, `mem_limit` en todo, solo imágenes, configuración dentro de las imágenes, `/healthz`, `/version.json`, `TRUSTED_PROXY_CIDR`, variables obligatorias con `${VAR:?}` |
| RNF-02 | Memoria total por debajo de 1,5 GB (objetivo: 1,3 GB) |
| RNF-03 | El repositorio es público: ningún secreto, `.env` real ni clave en Git |
| RNF-04 | `main` solo cambia por PR aprobado por @yprevot; lo que llega a `main` se despliega solo |
| RNF-05 | Seguridad: OWASP ASVS 5.0 nivel 2 como lista de control; aislamiento estricto entre organizaciones |
| RNF-06 | Privacidad: LFPDPPP (México), PIPEDA (Canadá), leyes estatales de EE. UU. (CCPA/CPRA) y GDPR como referencia; exportación y borrado de cuenta |
| RNF-07 | Accesibilidad WCAG 2.2 AA |
| RNF-08 | Rendimiento: disponibilidad p95 < 300 ms y confirmación de reserva p95 < 500 ms con 50 peticiones/s en los límites de memoria; LCP < 2,5 s en móvil medio con 4G |
| RNF-09 | SEO bilingüe: `hreflang`, `canonical`, `x-default`, `sitemap.xml` y `robots.txt` por dominio |
| RNF-10 | Correctitud horaria: ninguna cita a una hora equivocada por zona horaria o cambio de horario de verano |
| RNF-11 | Las colas no pueden perder citas: todo estado durable vive en PostgreSQL (incluido en la copia nocturna) |
| RNF-12 | Versiones: última estable de cada tecnología, verificada en su fuente (`03-versiones.md`) |

## 1.5 Interpretaciones de puntos ambiguos

Si el usuario no indica otra cosa, se aplican estas decisiones:

1. **«Tablero»** es un calendario de reservas. En el plan Sucursales cada sucursal es un tablero con su
   ubicación, zona horaria y feriados propios; el límite de 10 cuenta tableros activos.
2. **«Observadores»** son miembros de solo lectura que reciben avisos. Pueden entrar con Google o con
   correo y contraseña; los editores, solo con Google (así lo pidió el usuario).
3. **«Usuarios» que solo crean evento por evento** son los clientes finales. Se identifican sin
   contraseña: código de un solo uso por correo o Google. Así funciona también dentro de un iframe.
4. **«Los calendarios deben sincronizarse por clientes»** se cumple en dos sentidos: cada negocio conecta
   sus propias cuentas (Google, Microsoft, iCloud) a cada tablero, y cada cliente final recibe sus citas
   en su calendario (adjunto `.ics`, botones «Añadir al calendario» y un feed personal solo con sus citas).
5. **«Guardaremos su contraseña»** se implementa guardando solo el hash (Argon2id). Guardar la contraseña
   recuperable sería una vulnerabilidad grave.
6. **Configuración del tablero** (horarios, feriados, servicios) la cambia el propietario. Los editores
   gestionan eventos. Se puede ampliar más adelante con un permiso explícito.
7. **Editores y observadores por tablero**: hasta 10 por tablero en ambos planes (constante configurable;
   ver preguntas abiertas).
8. **Plan durante la prueba**: el negocio elige Personal o Sucursales al registrarse y prueba ese plan;
   puede cambiar durante la prueba.
9. **Páginas públicas de reserva** no se indexan en buscadores por defecto (`noindex`), pero llevan
   etiquetas Open Graph para que el enlace se vea bien al compartirlo por WhatsApp o redes.

## 1.6 Matriz de permisos

La aplican el `api` (guardas) y el motor en Go (segunda barrera). Las pruebas la recorren entera
(`09-pruebas.md` §9.4).

| Acción | Propietario | Editor | Observador | Cliente final | Visitante |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver horarios libres del tablero | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ver todos los eventos con detalle | ✓ | ✓ | ✓ | — | — |
| Ver sus propias reservaciones | ✓ | ✓ | ✓ | ✓ | — |
| Crear, editar y eliminar eventos (incl. recurrentes) | ✓ | ✓ | — | — | — |
| Crear eventos bloqueantes | ✓ | ✓ | — | — | — |
| Crear una reservación (una a una) | ✓ (para un cliente) | ✓ (para un cliente) | — | ✓ (propia) | Tras verificar su correo |
| Reprogramar o cancelar una reservación | ✓ | ✓ | — | ✓ (propia) | — |
| Configurar horarios, descansos, feriados y servicios | ✓ | — | — | — | — |
| Invitar o quitar editores y observadores | ✓ | — | — | — | — |
| Conectar calendarios externos al tablero | ✓ | — | — | — | — |
| Feed `.ics` personal | ✓ | ✓ | ✓ | ✓ (solo sus citas) | — |
| Facturación y plan | ✓ | — | — | — | — |
| MCP (IA) | ✓ | ✓ (con sus permisos) | ✓ (lectura) | Fase posterior | — |

## 1.7 Cambios respecto al estudio técnico

| Tema | Estudio técnico | Este plan | Motivo |
|---|---|---|---|
| Backend | Todo en Go | Go para el motor de calendario; NestJS (Fastify) para el negocio | Indicación del 2026-10-06 |
| Interfaz web | Abierta (TypeScript o `templ` + `htmx`) | React 19 con React Router 8 (SSR) | Indicación del 2026-10-06 |
| Login | Solo Google | Google o correo y contraseña con verificación | Indicación del 2026-10-06 |
| Recurrencia | También para clientes finales | Solo propietario y editores | Indicación del 2026-10-06 |
| Calendarios externos | Solo lectura de libre/ocupado + `.ics` | Feeds ICS, lectura de ocupado y escritura de nuestros eventos en Google, Microsoft e iCloud, con nuestro sistema como fuente de verdad | El usuario pide sincronizar con los tres proveedores |
| Suscripciones | `stripe-go` | SDK de Stripe para Node en NestJS | El negocio vive en NestJS |
| IA | Chatbot con Claude dentro de la app | MCP para que el negocio use su propia IA (Claude, ChatGPT, Gemini). El chatbot pasa a post-lanzamiento y reutilizará las mismas herramientas | Indicación del 2026-10-06; sin coste de IA para la plataforma |
| DayOtter | Descartado como motor | Se mantiene; se adoptan ideas (no código) | `11-dayotter.md` |
| Feriados | No tratado | Conjunto de datos generado de `date-holidays` (unos 200 países con regiones) embebido en Go | Cobertura para «los países desde donde sea el cliente» |

## 1.8 Fuera de alcance de la primera versión

- Pagos por cita de los clientes finales al negocio (Stripe Connect): pospuesto. De momento, solo
  suscripción (decisión del 2026-10-06).
- Aplicaciones móviles nativas. La web es responsive y puede instalarse como PWA más adelante.
- API pública con claves y webhooks salientes para terceros (post-lanzamiento; el embed y MCP cubren el caso inicial).
- Sincronización bidireccional completa que acepte cambios hechos fuera (mover una cita en Google y que se
  reprograme aquí). En la v1 nuestro sistema es la fuente de verdad (ver `04-motor-calendario.md` §4.9).
- SMS, llamadas, recepcionista de voz y el resto de funciones de IA de DayOtter.
- Panel de superadministración de la plataforma (se opera con scripts y SQL de solo lectura).
- Stripe Checkout alojado sin marca de Stripe: el pago usa Embedded Checkout dentro de nuestra página; Stripe
  muestra su pie mínimo, inevitable.

## 1.9 Decisiones confirmadas y preguntas abiertas

**Confirmadas por el usuario el 2026-10-06:**

| Tema | Decisión |
|---|---|
| Cobro por cita (Stripe Connect) | Pospuesto. De momento, solo suscripción |
| Stripe | Se implementa completo (planes, Checkout, webhooks, estados), pero **sin configurar y sin valores reales**. Sin claves, «Contratar» muestra «Disponible pronto» y la prueba gratuita no vence. Se activa más adelante con el procedimiento de `05-negocio-api.md` §5.5 |
| Impuestos (Stripe Tax) | Se decide al activar Stripe; el interruptor `STRIPE_TAX_ENABLED` queda apagado |
| WhatsApp | El canal se implementa y queda **desactivado, sin valores reales**, hasta tener la cuenta de WhatsApp Business. No aparece en las preferencias mientras tanto |
| Copias de seguridad y seguridad del servidor | Las gestiona la plataforma con su propio sistema; el proyecto no añade nada por ahora |

**Abiertas**, con su decisión por defecto para no bloquear la ejecución:

| Pregunta | Decisión por defecto |
|---|---|
| Límite de editores y observadores por tablero | 10 |
| Cupo de mensajes de WhatsApp por plan (cada mensaje cuesta) | Al activarlo: 300 al mes en Personal y 1 500 en Sucursales |
| Verificación de Google OAuth para permisos de Calendar | Se solicita en F12; hasta entonces, modo de prueba con un máximo de 100 usuarios |
| ¿Se acepta la contraseña específica de app de Apple para iCloud? | Sí; es el único método de CalDAV en iCloud |
| Retención de datos tras vencer la prueba o cancelar | 90 días en solo lectura; después, borrado con aviso previo |
| ¿Páginas de reserva indexables? | `noindex` por defecto; opción por tablero en post-lanzamiento |
| Chatbot para clientes finales del estudio técnico | Post-lanzamiento, reutilizando las herramientas MCP |
| Logotipo y nombre comercial definitivos | Se trabaja con los tokens de diseño de `07-frontend.md` y un logotipo provisional |
