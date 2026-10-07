# 7. Frontend (`services/web`, React 19 + React Router 8)

Una sola aplicación React sirve los dos dominios y todo el producto: páginas públicas, registro, panel,
página de reserva, área del cliente final y widget embebido. Se renderiza en el servidor (SSR) para que el
idioma, `<html lang>`, `hreflang`, `canonical`, Open Graph y la CSP salgan correctos en el primer HTML.

## 7.1 Stack y modo de render

| Pieza | Elección |
|---|---|
| Framework | React Router 8 en modo framework (Vite 8), SSR sobre Node 24 con `@react-router/serve` |
| Middleware | Idioma por `Host`, sesión del usuario, cabeceras por ruta (CSP con nonce) |
| Datos | `loader` en servidor en todas las páginas; mutaciones con `fetch` y revalidación; SSE avisa de cambios (ADR 0014) |
| Estilos | Tailwind CSS 4.3 con tokens propios; componentes shadcn/ui sobre `radix-ui` |
| Formularios | react-hook-form + Zod 4 (esquemas compartidos de `packages/schemas`) |
| Calendario del panel | FullCalendar 7 (`daygrid`, `timegrid`, `list`, `interaction`; solo plugins MIT) |
| Selector de horarios | Componente propio, ligero y pensado para móvil |
| Fechas | `Intl` + `temporal-polyfill` para aritmética con zonas |
| i18n | Catálogos JSON tipados en `packages/i18n`; el loader raíz entrega solo el del idioma (ADR 0013) |
| Iconos | Lucide |

## 7.2 Español e inglés (requisito obligatorio)

Toda la experiencia existe en los dos idiomas, con el mismo nivel de calidad. No hay texto de interfaz
fuera de los catálogos.

**Reglas del README que se cumplen aquí:**

1. El middleware decide el idioma por `Host`: `micitaentiempo.online` → `es`, `myappointmentontime.online`
   → `en`, cualquier otro → el primero de `IDIOMAS`. Nunca por `Accept-Language` ni por IP. El mapa de
   hosts se deriva de `SITE_URL_ES` y `SITE_URL_EN` (en local, de `HOST_LANG_MAP`).
2. `<html lang="es">` o `<html lang="en">` en el HTML del servidor.
3. Cada página pública lleva `canonical` en su dominio, `alternate hreflang="es"` y `hreflang="en"` hacia su
   par y `x-default` hacia el dominio principal.
4. `sitemap.xml` y `robots.txt` por dominio (rutas de recurso que leen el `Host`).
5. Rutas traducidas con un mapa común; el selector de idioma enlaza al par **sin redirigir solo**. El
   selector muestra «Español» y «English», nunca banderas (las banderas son países, no idiomas).
6. Sesiones por dominio: si alguien con sesión cambia de idioma, el otro dominio le pide entrar de nuevo;
   la interfaz lo explica antes de cambiar.
7. Correos y avisos en el idioma guardado en la cuenta y desde su dominio (lo hace `api` con los mismos
   catálogos y las credenciales SMTP de ese idioma).
8. Login con Google con los dos orígenes y las dos URI de retorno en el mismo cliente OAuth
   (`05-negocio-api.md` §5.2).
9. Privacidad y condiciones publicadas en cada dominio (`/privacidad` y `/condiciones`; `/privacy` y `/terms`).
10. Newsletter en el Listmonk del idioma (`LISTMONK_URL` / `LISTMONK_URL_EN`).
11. Fechas en UTC en la base de datos y mostradas en la zona horaria guardada en la cuenta
    (`02-arquitectura.md` §2.9).

Además del README: el embed, MCP, los mensajes de error, los avisos de WhatsApp, Slack y Telegram, los
`.ics` y los nombres de feriados salen en el idioma del dominio o de la cuenta; los escenarios
automatizados se ejecutan en los dos idiomas (`09-pruebas.md` §9.2).

**Mapa de rutas** (`packages/i18n/routes.ts`; un id, dos rutas, el mismo módulo):

| Id | Español | Inglés | Acceso |
|---|---|---|---|
| `home` | `/` | `/` | Público |
| `pricing` | `/precios` | `/pricing` | Público |
| `features` | `/funciones` | `/features` | Público |
| `faq` | `/preguntas-frecuentes` | `/faq` | Público |
| `connectAi` | `/conecta-tu-ia` | `/connect-your-ai` | Público |
| `contact` | `/contacto` | `/contact` | Público |
| `privacy` | `/privacidad` | `/privacy` | Público |
| `terms` | `/condiciones` | `/terms` | Público |
| `credits` | `/creditos` | `/credits` | Público (atribución de datos de feriados) |
| `signUp` | `/registro` | `/sign-up` | Público |
| `signIn` | `/entrar` | `/sign-in` | Público |
| `forgotPassword` | `/recuperar-contrasena` | `/forgot-password` | Público |
| `verifyEmail` | `/verificar-correo` | `/verify-email` | Público |
| `invitation` | `/invitacion/:token` | `/invitation/:token` | Público → sesión |
| `welcome` | `/bienvenida` | `/welcome` | Propietario (asistente de alta) |
| `booking` | `/reservar/:slug` | `/book/:slug` | Público, `noindex` |
| `myAppointments` | `/citas` | `/appointments` | Cliente final |
| `myAppointment` | `/citas/:id` | `/appointments/:id` | Cliente final |
| `dashboard` | `/panel` | `/dashboard` | Personal del negocio |
| `calendar` | `/panel/calendarios/:id` | `/dashboard/calendars/:id` | Personal |
| `calendarSettings` | `/panel/calendarios/:id/ajustes` | `/dashboard/calendars/:id/settings` | Propietario |
| `calendarTeam` | `/panel/calendarios/:id/equipo` | `/dashboard/calendars/:id/team` | Propietario |
| `customers` | `/panel/clientes` | `/dashboard/customers` | Propietario, editor |
| `inbox` | `/panel/avisos` | `/dashboard/notifications` | Personal |
| `account` | `/panel/cuenta` | `/dashboard/account` | Todos con sesión |
| `notificationSettings` | `/panel/cuenta/avisos` | `/dashboard/account/notifications` | Todos con sesión |
| `integrations` | `/panel/integraciones` | `/dashboard/integrations` | Propietario (calendarios), todos (canales) |
| `ai` | `/panel/ia` | `/dashboard/ai` | Personal |
| `billing` | `/panel/facturacion` | `/dashboard/billing` | Propietario |
| `oauthConsent` | `/oauth/consentimiento` | `/oauth/consent` | Sesión (MCP) |
| `embed` | `/embed/:slug` | `/embed/:slug` | Público (iframe) |

Una ruta del otro idioma en un dominio (p. ej. `/pricing` en el dominio en español) responde 301 a su par
**en el mismo dominio** (`/precios`), nunca al otro dominio.

**Catálogos:** `packages/i18n/locales/{es,en}/<espacio>.json` (común, público, panel, reserva, correos,
avisos, errores, mcp). Claves tipadas; plurales con `Intl.PluralRules`; sin concatenar frases; los errores
de Zod se traducen con un mapa propio. Un paso de CI falla si falta una clave en un idioma o sobra en el
otro. Español neutro con tuteo; inglés de EE. UU. Glosario fijo (tablero/board, reservación/booking,
evento bloqueante/time block, observador/viewer).

**Formatos:** región por defecto `es-MX` y `en-US`, modificable en la cuenta (12 h o 24 h, primer día de la
semana); fechas con nombre de mes; precios como «US$5 al mes» y «$5/month». Contenido largo (legales y
ayuda) en Markdown por idioma (`content/{es,en}/…`), revisado por una persona nativa antes del lanzamiento.

## 7.3 Pantallas

| Área | Pantallas |
|---|---|
| Pública | Inicio, funciones, precios (dos planes y la prueba), preguntas frecuentes, «Conecta tu IA», contacto (con alta opcional a la newsletter), legales, créditos, 404 y 500 localizadas |
| Acceso | Registro (Google o correo), entrar, recuperar contraseña, verificar correo, aceptar invitación (Google obligatorio para editores) |
| Alta | Asistente: plan → tablero (nombre, zona, ubicación) → horario y descansos → feriados (países, región, tipos, vista previa del año) → primer servicio → compartir (enlace y código de embed) |
| Panel | Inicio (próximas citas, avisos, estado del plan), calendario por tablero, ajustes del tablero, equipo, clientes, avisos, cuenta, preferencias de avisos, integraciones, IA, facturación |
| Cliente final | Página de reserva, «Mis citas» (ver, reprogramar, cancelar, añadir al calendario, feed personal) |
| Embed | Reserva y «Mis citas» dentro del iframe |
| OAuth | Consentimiento para aplicaciones MCP |

## 7.4 Calendario del panel

- Vistas según el ancho: < 640 px → lista o día; 640–1023 px → semana de 3 días o semana; ≥ 1024 px → mes,
  semana y día. Cambio manual siempre disponible.
- Crear arrastrando (escritorio) o con el botón «+» (móvil); editar en un panel lateral (escritorio) o a
  pantalla completa (móvil).
- Tipos de evento con icono y color: cita, cita con cliente final, bloqueo, feriado (fondo), fuera de
  horario (sombreado).
- Editor de recurrencia limitado al subconjunto del motor (diaria, semanal con días, mensual por día o por
  «segundo martes», anual, fin por fecha o por número). Al editar una serie se pregunta el alcance: «solo
  este», «este y los siguientes», «todos».
- Avisos de conflicto antes de guardar (devueltos por el motor).
- Zona del tablero visible; si la del usuario es distinta, se muestran las dos.
- Actualización en tiempo real con SSE; un cambio hecho por otra persona se marca brevemente.
- Observadores: misma vista, sin acciones de edición.

## 7.5 Flujo de reserva del cliente final

Pensado primero para móvil:

1. **Servicio** (si hay más de uno).
2. **Fecha**: calendario mensual con días sin huecos atenuados y feriados marcados.
3. **Hora**: botones de 44 px mínimo, en la zona del visitante (detectada con `Intl`), con selector de zona
   y la del negocio indicada si difiere.
4. **Tus datos**: nombre completo, correo, teléfono opcional (E.164), nota opcional. Se crea el hold y se
   muestra la cuenta atrás de 10 min.
5. **Verificación**: código de 6 dígitos por correo o «Continuar con Google» (ventana emergente).
6. **Confirmación**: resumen, «Añadir a Google Calendar», «Añadir a Outlook», descarga `.ics`, enlace a
   «Mis citas».

Si alguien toma el horario mientras tanto, se explica y se ofrecen los siguientes libres.

## 7.6 Embed

- **Iframe directo** (lo más simple, sirve en cualquier constructor de webs):
  `<iframe src="https://micitaentiempo.online/embed/clinica-sol" title="Reservar cita" loading="lazy">`.
- **Script cargador** (`/embed.js`, < 5 KB, sin dependencias):
  `<script src="https://micitaentiempo.online/embed.js" data-calendar="clinica-sol" data-mode="inline|popup|button" async></script>`;
  ajusta la altura con `postMessage` (comprobando el origen) y emite `micita:booking_confirmed` a la página
  anfitriona.
- El idioma es el del dominio del `src`. El panel genera los fragmentos en los dos idiomas y da
  instrucciones para WordPress, Wix, Squarespace y HTML.
- Seguridad: `frame-ancestors` según la política del tablero (cualquier sitio por defecto, o lista de
  dominios); sin cookies de terceros: token Bearer en memoria y `sessionStorage` del iframe
  (particionado). Google se abre en ventana emergente.
- Sin analítica dentro del embed (se ejecuta en webs ajenas).

## 7.7 Diseño

**Principios:** claro, cálido y tranquilo; espacio generoso; una acción principal por pantalla; el color
nunca es la única señal (siempre icono o texto); nada de símbolos religiosos, gestos con las manos,
banderas como idioma ni imágenes de personas que excluyan.

**Paleta** (definir como tokens CSS; los contrastes indicados son con el color de texto previsto):

| Token | Color | Uso | Contraste |
|---|---|---|---|
| `primary` «Laguna» | `#1D6F86` | Acciones principales, enlaces, foco | 5,7:1 con blanco |
| `primary-hover` | `#175C70` | Hover y activo | Mayor que `primary` |
| `primary-soft` | `#E3F1F4` | Selección, fondos informativos | Con texto `#1F2A30` |
| `secondary` «Salvia» | `#6E9E87` | Ilustraciones y acentos decorativos | No se usa para texto |
| `accent` «Albaricoque» | `#E8A37A` | Destacados puntuales | Solo con texto oscuro |
| `background` «Arena» | `#FAF8F4` | Fondo general | — |
| `surface` | `#FFFFFF` | Tarjetas y paneles | — |
| `border` | `#E4E1DA` | Bordes y divisores | — |
| `text` «Pizarra» | `#1F2A30` | Texto principal | > 13:1 sobre Arena |
| `text-muted` | `#55626B` | Texto secundario | 5,9:1 sobre Arena |
| `success` | `#2E7D5B` | Confirmaciones, con icono | 5,0:1 con blanco |
| `warning` | `#9A5B00` sobre `#FFF4E0` | Avisos, con icono | 5,4:1 con blanco |
| `danger` | `#B3261E` | Errores y acciones destructivas, con icono | 6,5:1 con blanco |
| Modo oscuro | Fondo `#0F1A1F`, superficie `#16232A`, texto `#E8EEF0`, primario `#5FB3C8` | | Primario 7,4:1 sobre el fondo |

Colores para eventos (el usuario elige; nombres en el idioma de la interfaz): Laguna `#1D6F86`, Cielo
`#3A86C8`, Salvia `#4F8A6E`, Oliva `#7A8B3A`, Turquesa `#2A9D8F`, Albaricoque `#D9894E`, Coral `#D0675A`,
Pizarra `#5B6B78`.

**Por qué esta paleta** (neutral en las culturas objetivo, sobre todo la occidental):

| Color | Decisión | Motivo |
|---|---|---|
| Azul verdoso | Color de marca | Se asocia a confianza y calma en Occidente y Latinoamérica, y no carga significados negativos fuertes en otras regiones |
| Verde salvia | Solo decorativo | Naturaleza y crecimiento; sin usarlo como «éxito» para no confundir |
| Neutros cálidos | Fondo Arena en vez de blanco puro | El blanco puro en grandes superficies es frío y en partes de Asia oriental se asocia al luto |
| Rojo | Solo errores, con icono | En Occidente significa peligro; en China, suerte: no debe ser decoración |
| Amarillo intenso | No se usa; ámbar oscuro solo para avisos | En México el amarillo del cempasúchil se asocia al Día de Muertos; además, mal contraste |
| Morado | No se usa | Luto en Brasil, partes de Latinoamérica y Tailandia |
| Negro dominante | No se usa (texto en pizarra; el modo oscuro es azul petróleo) | Luto en Occidente |

**Tipografía:** Inter Variable autoalojada (cubre á, é, ñ, ü, ¿, ¡), pesos 400/500/600, base 16 px (evita el
zoom de iOS en formularios), escala 12/14/16/18/20/24/30/36/48, interlineado 1,5 en texto y 1,2 en títulos,
cifras tabulares en horas y precios.

**Forma y movimiento:** retícula de 4 px; radios de 12 px (tarjetas) y 10 px (campos); sombras suaves;
transiciones de 150–200 ms que respetan `prefers-reduced-motion`; modo claro y oscuro según el sistema, con
selector en la cuenta.

**Ilustración:** formas geométricas abstractas (calendarios, relojes, curvas suaves) en la paleta; sin
personas.

**Tono:** cercano y respetuoso; frases cortas; sin modismos ni chistes que no se traducen; los errores
dicen qué pasó y cómo resolverlo; fechas siempre con nombre de mes.

**Componentes base:** botón, campo, selector, combobox con búsqueda (zonas y países), diálogo (cajón en
móvil), pestañas, aviso emergente, calendario de fecha, menú, tabla de datos, insignia, avatar con
iniciales, esqueleto de carga, estado vacío, asistente por pasos, rejilla de horarios, editor de horario
semanal, editor de recurrencia, selector de feriados con vista previa, campana de avisos.

Al empezar F6 se puede usar la skill `frontend-design` o `impeccable` para afinar la dirección visual dentro
de estas restricciones.

## 7.8 Accesibilidad (WCAG 2.2 AA)

Foco siempre visible; calendario y rejilla de horarios usables con teclado; cada horario con etiqueta
completa («martes 3 de noviembre, 10:30, disponible»); regiones `aria-live` para cambios de disponibilidad y
avisos; objetivos táctiles de 44 px; etiquetas y errores asociados a cada campo; `lang` en fragmentos de otro
idioma; contraste comprobado en CI con axe.

## 7.9 Rendimiento y SEO técnico

- Objetivos en móvil medio con 4G: LCP < 2,5 s, INP < 200 ms, CLS < 0,1.
- Presupuesto de JavaScript comprimido: páginas públicas ≤ 130 KB y reserva/embed ≤ 150 KB (ADR 0013 y
  0014: React 19 + React Router ya ocupan ~105 KB); FullCalendar solo se carga en el panel.
- Fuentes con `preload` y `font-display: swap`; imágenes AVIF/WebP con dimensiones.
- Páginas públicas con `Cache-Control: public, max-age=0, s-maxage=60` y microcaché en el gateway por
  `Host` + ruta.
- Datos estructurados `SoftwareApplication` y `Organization` en la portada; Open Graph por idioma.

## 7.10 Seguridad del frontend

- CSP por petición con nonce, generada en `entry.server`: `script-src 'self' 'nonce-…'` más el origen de
  Umami; en facturación y solo con Stripe activo, además `https://js.stripe.com`, `frame-src
  https://js.stripe.com https://checkout.stripe.com` y `connect-src https://api.stripe.com`.
- `frame-ancestors 'none'` en todo salvo `/embed/*` (política del tablero).
- `Permissions-Policy` con `payment=()` salvo en facturación (`payment=(self "https://js.stripe.com")`).
- `Cross-Origin-Opener-Policy: same-origin`; en el embed, `same-origin-allow-popups` (Google en ventana).
- Sin tokens en `localStorage`: cookies `HttpOnly` en el sitio; en el embed, memoria + `sessionStorage`.
- Redirecciones tras el inicio de sesión solo a rutas relativas propias.

## 7.11 Funciones que dependen de configuración

`web` consulta `GET /api/public/v1/features` y adapta la interfaz a lo que esté configurado:

| Integración sin configurar | Qué ve el usuario |
|---|---|
| Stripe (decisión del 2026-10-06: sin configurar por ahora) | Precios y planes visibles; «Contratar» muestra «Disponible pronto»; «Periodo de prueba» sin cuenta atrás; ningún script de Stripe |
| WhatsApp (sin configurar por ahora) | La opción no aparece en preferencias ni en canales |
| Google, Microsoft, Slack, Telegram | El botón correspondiente no aparece (Google: solo correo y contraseña para entrar) |
| Listmonk | Sin casilla de newsletter |

## 7.12 Analítica

Umami sin cookies, una sola web para los dos dominios: `web` inserta el script con nonce cuando existen
`UMAMI_SCRIPT_URL` y `UMAMI_WEBSITE_ID` (la plantilla lo hacía en nginx; con CSP por nonce es más seguro
hacerlo en la app). Eventos sin datos personales: `sign_up_started`, `sign_up_completed`, `trial_started`,
`checkout_started`, `subscription_activated`, `calendar_created`, `embed_copied`, `ai_connected`.
