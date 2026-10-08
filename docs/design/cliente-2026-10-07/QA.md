# QA de la implementación — 7 de octubre de 2026

Rama `design/propuesta-frontend-cliente`. Gemini implementó las fases A–D y los recorridos alternativos de reserva en los commits hasta `110219a`. Codex revisó sus cambios pendientes, corrigió regresiones reales y completó la validación local descrita aquí. La afirmación anterior de «100 % verificado» en el traspaso se ha sustituido por resultados y límites concretos.

## Correcciones verificadas

- Centralizar en `matchRoute` el reconocimiento de las rutas `.data` de React Router evita documentos legales vacíos al navegar sin recargar. Se retiró la normalización redundante de la ruta legal y se añadieron seis regresiones unitarias ES/EN y navegación interactiva con comprobación de título y contenido.
- El nombre inglés del producto y los controles de cabecera desbordaban a 320 px en Acceso, Mis citas y el panel. El logo puede ajustarse en dos líneas y los contenedores conservan espacio para las acciones. Se guardaron capturas anteriores y posteriores.
- El panel español fallaba a 768 px con `undefined.toLocaleLowerCase` al generar la ayuda de «Hoy» para la vista personalizada de tres días. Se añadieron texto y ayudas traducidas de esa vista y del botón Hoy. Se verificó el calendario autenticado en todos los anchos de la matriz. La API `buttons` corresponde a [FullCalendar 7](https://fullcalendar.io/docs/upgrading-from-v6-js).
- Los tests de enlaces ahora esperan estilos y el cierre del menú tras navegar; el cambio de idioma pulsa el enlace visible. La página anfitriona de pruebas de embed incluye viewport móvil, evitando una falsa pantalla de 980 px en la emulación de Pixel 8.
- CI incluye ahora los escenarios `@qa-diseno` y `@enlaces`, además de `@humo` y `@critico`.
- La primera ejecución remota detectó una espera insuficiente en el nuevo test de foco: la traza mostraba ALTCHA todavía comprobando al agotar los cinco segundos. Se alinearon las dos esperas asíncronas de ese test con los 30 segundos que ya usa el recorrido de reserva, conservando las comprobaciones de foco y campo OTP.

## Resultados y entorno

Se reconstruyó únicamente el servicio web del entorno aislado `mcet-ci` con `compose.prod.yml` + `compose.ci.yml` + `.env.ci`, y se recreó con `--no-deps --wait`. Los ocho servicios quedaron saludables. Las altas, correos, agenda y pagos de pruebas pertenecen a ese entorno. No se reiniciaron los contenedores del otro proyecto `micita_*`.

El web comprobado anuncia `qa-110219a-working`; imagen `sha256:595917e80fb00dbb7a08db7c28bffb0ca487ccffb529a104c59a3b0f7ae59c31`. Es una compilación del árbol de trabajo, no prueba de un SHA final de Git. API y gateway conservan las imágenes locales de CI.

| Comprobación | Resultado |
|---|---|
| `pnpm lint` | Pasa; cinco advertencias preexistentes (estilos de movimiento reducido y una cadena opcional) |
| `pnpm typecheck`, `pnpm i18n:check` | Pasan; catálogos ES/EN completos |
| `pnpm test` | 172: i18n 11 + API 161; web no tiene tests unitarios propios |
| `go test -race ./...` en `services/calendar` | Pasa, incluidas integraciones con Testcontainers |
| Primera pasada BDD completa | 155 casos: 153 aprobados y 2 fallidos por una expectativa de texto incorrecta en el nuevo test de iframe |
| Repetición de los 2 casos de iframe | 2 aprobados tras esperar el texto real «Consulta general · Consultas»; no se modificó la aplicación para resolverlos |
| Pasada aislada `reloj` | 8 aprobados |
| Repetición del caso de foco tras corregir las esperas de CI | 6 aprobados: tres ejecuciones en escritorio y tres en móvil |
| Total de casos locales aprobados | 163 distintos, en ejecuciones complementarias; no se presenta la primera pasada como completamente verde |
| Humo de producción de solo lectura | 2 aprobados: ambos dominios, versión, salud, cabeceras, robots/sitemap y descubrimiento MCP |

Informes completos, ignorados por Git: `tests/escenarios/playwright-report-final/index.html`, `playwright-report-embed/index.html`, `playwright-report-reloj/index.html` y `playwright-report-produccion/index.html`. Sus estadísticas se conservaron en [qa/pruebas.json](qa/pruebas.json).

### Matriz visual y funcional

- 12 páginas públicas ES/EN y 2 estados de panel con sesión y nombre largo; anchos 320, 390, 768 y 1440 px, altura 900 px, claro y oscuro: 112 medidas sin desbordamiento horizontal ni controles principales fuera de la pantalla.
- Axe en 320 y 1440 px, ambos esquemas: 56 auditorías sin violaciones graves o críticas. Esto no acredita conformidad WCAG completa.
- Reserva con teclado: selección explícita, foco en Tus datos y Verificación, campos identificados y contador fuera de una región de anuncios periódicos.
- Diálogo de nueva cita: apertura con Enter, 15 pasos de Tab contenidos, Escape y restauración del foco.
- Iframe de otro origen, escritorio y móvil: reserva completa con OTP recibido en Mailpit, sesión en Mis citas, cancelación disponible, altura dinámica y evento `micita:booking_confirmed` recibido por el anfitrión.
- 35 casos de enlaces y navegación: escritorio, cuatro recorridos móviles y cuatro de tableta. Los documentos legales verifican contenido, no solo HTTP 200.

Medidas en [qa/reflujo.json](qa/reflujo.json), 18 capturas actuales en `qa/capturas/`, tres capturas previas en `qa/regresiones/` y árboles accesibles de diálogo/verificación en `qa/*-arbol-accesible-*.txt`. Se inspeccionaron visualmente las capturas de Acceso inglés a 320 px y panel español oscuro/inglés estrecho.

### Rendimiento

Las pruebas existentes midieron 126 KB de JS comprimido en portada y 133 KB en reserva, dentro de sus límites. [qa/metricas-laboratorio.json](qa/metricas-laboratorio.json) contiene 12 muestras con Chromium 153.0.8010.12 y `web-vitals` 6.2.3: portada ES/EN y reserva ES a 390/1440 px, dos muestras cada una, contexto nuevo, sin limitar CPU ni red. LCP 76–160 ms, INP observado 16–88 ms y CLS 0.

Estos resultados describen el equipo y servidor locales. La portada de escritorio usa un clic en el título estático: ese INP no representa una tarea completa. En móvil se abrió/cerró el menú y en reserva se eligieron día y hora. No son RUM, percentil 75, carga sostenida ni rendimiento de producción. El método usa las funciones oficiales de [web-vitals](https://github.com/GoogleChrome/web-vitals).

## Producción y pendientes concretos

Ambos dominios publicados devolvieron revisión `8251bfa52d6b89383116b4aa2e5b25ce738d94c2`, anterior a esta rama. Su configuración pública indica `google: false`, `googleClientId: null`, y Microsoft/Stripe/Slack/Telegram/WhatsApp desactivados. El humo leído no publica estos cambios ni acredita OAuth real.

1. Probar lector de pantalla real, zoom nativo 200/400 % y Safari/iOS y Chrome/Android físicos. Los 320 px simulados y árboles accesibles no sustituyen esas pruebas.
2. Validar Google con un entorno configurado y una cuenta de prueba autorizada. Los escenarios locales usan el doble de GSI y los correos de Mailpit.
3. Completar autorización y uso de MCP desde un cliente externo real con esa cuenta. Los escenarios MCP locales y el descubrimiento público sí pasan.
4. Revisar el CI de la rama antes de integrar y publicar. No se fusionó a `main` ni se desplegó en producción durante esta revisión.

## Repetición local

```sh
pnpm lint && pnpm i18n:check && pnpm typecheck && pnpm test
(cd services/calendar && go test -race ./...)
INFORME=final pnpm escenarios --headed --workers 4
# Solo QA añadida y enlaces:
pnpm --filter @mcet/escenarios exec ./correr.sh --grep '@qa-diseno|@enlaces' --headed --workers 4
```

Las pruebas con reloj se ejecutan al final y aisladas mediante `correr.sh`; no correr otras suites que dependan del reloj en paralelo.
