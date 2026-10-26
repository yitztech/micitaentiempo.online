# Pruebas, aplicaciones móviles y validación de datos

El proyecto contiene la web React Router (`services/web`), la aplicación móvil Expo para Android e iOS en teléfonos y tablets (`services/mobile`), la API NestJS/Fastify (`services/api`) y el motor de calendario Go (`services/calendar`).

- `test:android`, `test:ios`, `test:android:tablet` y `test:ios:tablet` prueban la interfaz y los flujos en emulación móvil y de tablet con Playwright (Pixel 8 / Chromium, iPhone 13 / WebKit, Galaxy Tab S9 800×1280 / Chromium e iPad Pro 11 834×1194 / WebKit).
- `tests/unit/mobile-app.test.js` y `tests/unit/mobile.test.js` prueban el paquete móvil Expo (`@mcet/mobile`), su configuración para Android e iOS con soporte de tablets (`supportsTablet: true`, `supports-screens`), el diseño adaptativo (1 columna y barra inferior en teléfonos; 2 columnas maestro-detalle y riel lateral en tablets), el cliente HTTP conectado al backend y el inicio de sesión con Google.
- `test:native:android`, `test:native:ios`, `test:native:tablets` y `test:native:mobile` ejecutan el runner nativo W3C WebDriver / Appium (`scripts/test-native-mobile.mjs`) contra emuladores/simuladores reales cuando se proporcionan el servidor Appium y los artefactos compilados (`.apk` / `.app`). Si falta el servidor o el artefacto nativo, fallan explícitamente sin simular éxito.

## Preparación local

Requisitos: Node >=22.22, pnpm 12.9.1, Go según `services/calendar/go.mod`, Docker en ejecución y los navegadores de Playwright.

```sh
pnpm install --frozen-lockfile
pnpm --filter @mcet/escenarios exec playwright install chromium webkit
pnpm test:env:up
```

El entorno `mcet-tests` usa exclusivamente datos sintéticos y `.env.ci`. Levanta las imágenes del código actual, PostgreSQL, Mailpit y dobles HTTP de proveedores. Ocupa los puertos 8080, 8025, 4010 y 5232; comprueba que están libres antes de levantarlo. No reutilices bases ni credenciales de producción. Las suites SQL crean otros PostgreSQL efímeros mediante Testcontainers y los eliminan al terminar. No aceptan un DSN de producción.

En macOS, si Testcontainers no descubre Docker, usa las variables de conexión documentadas por tu instalación de Docker; no desactives las pruebas para ocultar el problema. Sin Docker, `test:db` falla. El modo Go `-short` omite explícitamente las pruebas SQL.

Los nombres `micitaentiempo.localhost` y `myappointmentontime.localhost` deben resolver a loopback. Para otra dirección local, configura `ES_URL`, `EN_URL` y `MAILPIT_URL` según `tests/escenarios/fixtures/`; las URL públicas del entorno deben coincidir para verificar correos y cookies. No apuntes suites que escriben datos a producción.

## Comandos independientes y ejecución conjunta

| Comando | Alcance | GitHub |
|---|---|---|
| `pnpm test` / `pnpm test:unit` | Unitarias JS/TS: contratos Zod, i18n, API, cliente HTTP web, app móvil Expo y adaptador W3C | Sí |
| `pnpm test:schemas` | Límites, Unicode, caracteres, contratos móviles y adaptador nativo | Sí, dentro de unitarias |
| `pnpm test:calendar:unit` | Motor Go, propiedades y escenarios YAML; `-short -race` excluye SQL | Sí |
| `pnpm test:backend` | Unitarias API/contratos, unitarias Go e integración HTTP Gherkin | Sí, cubierto por los jobs de CI |
| `pnpm test:frontend` | Unitarias web y Gherkin de interfaz en escritorio | Sí, cubierto por los jobs de CI |
| `pnpm test:integration` | Gherkin HTTP `@backend` y escenarios del reloj aislados | Sí |
| `pnpm test:behavior` | Todo el catálogo Gherkin en escritorio, después `@reloj` | Sí |
| `pnpm test:db` | SQL directo, migraciones reales de ambos esquemas, integración RPC/SQL y motor/outbox Go | **No** |
| `pnpm test:android` | Todos los escenarios `@frontend` en teléfono Android (Pixel 8 / Chromium) | **No** |
| `pnpm test:ios` | Todos los escenarios `@frontend` en teléfono iOS (iPhone 13 / WebKit) | **No** |
| `pnpm test:android:tablet` | Todos los escenarios `@frontend` en tablet Android (Galaxy Tab S9 800×1280 / Chromium) | **No** |
| `pnpm test:ios:tablet` | Todos los escenarios `@frontend` en tablet iOS (iPad Pro 11 834×1194 / WebKit) | **No** |
| `pnpm test:tablets` | Tablets Android e iOS, una después de la otra | **No** |
| `pnpm test:mobile` | Teléfonos y tablets Android e iOS (`android`, `ios`, `android-tablet`, `ios-tablet`) | **No** |
| `pnpm test:native:android` | Runner nativo W3C WebDriver / Appium en Android (requiere `.apk` y Appium) | **No** |
| `pnpm test:native:ios` | Runner nativo W3C WebDriver / Appium en iOS (requiere `.app` y Appium) | **No** |
| `pnpm test:native:tablets` | Runner nativo W3C WebDriver / Appium en tablets Android e iOS | **No** |
| `pnpm test:native:mobile` | Runner nativo W3C WebDriver / Appium en teléfonos y tablets Android e iOS | **No** |
| `pnpm test:ci` | Unitarias JS/TS + Go sin SQL + comportamiento escritorio | Sí; requiere el entorno levantado |
| `pnpm test:all` | Unitarias JS/TS + Go + SQL + todo Gherkin + teléfonos y tablets Android/iOS | Sólo local |

`test:env:up` construye y espera la salud del entorno; termina antes de iniciar las suites. `test:env:down` lo detiene sin borrar su volumen. Las suites BDD comprueban la disponibilidad antes de empezar.

La ejecución conjunta es secuencial entre suites y usa cuatro workers dentro de cada proyecto de Playwright. No ejecutes comandos BDD independientes simultáneamente contra la misma instancia: comparten el reloj controlable y algunos dobles de proveedores. Los escenarios `@reloj` corren solos al final de backend/escritorio. No se cambian reintentos ni se ocultan fallos; un fallo devuelve código distinto de cero y detiene la ejecución conjunta.

Para filtrar o depurar:

```sh
pnpm test:frontend -- --grep @validacion --headed
pnpm test:integration -- --grep @reservas
pnpm test:ios -- --grep '@reservas|@validacion' --headed
pnpm test:tablets -- --grep "Aplicaciones móviles"
pnpm --filter @mcet/api exec vitest run test/zod-pipe.test.js
```

## Endpoints móviles y aplicación Expo (`services/mobile`)

La aplicación móvil Expo (`services/mobile`) para Android e iOS reutiliza los catálogos de `@mcet/i18n`, los esquemas y políticas de validación de `@mcet/schemas` (`services/web/app/lib/validation.ts`) y la estructura de interfaces del frontend, conectándose al backend mediante tokens `Bearer`:

- `GET /api/public/v1/mobile/bootstrap`: devuelve el idioma del dominio (`es` o `en`), `siteUrl`, banderas de funciones (`google`, `googleClientId`), esquemas nativos (`micitaentiempo://`, `myappointmentontime://`) y el usuario autenticado si se envía `Authorization: Bearer <token>`.
- `POST /api/public/v1/mobile/auth/sign-up`: registro móvil con las mismas validaciones de nombre (`AuthName`), correo y contraseña (12–128 caracteres), sin CAPTCHA (decisión del 2026-10-26).
- `POST /api/public/v1/mobile/auth/sign-in`: inicio de sesión móvil con correo y contraseña; devuelve `{ token, user, twoFactorRedirect }`.
- `POST /api/public/v1/mobile/auth/google` y `POST /api/public/v1/google/verify`: inicio de sesión con Google («Continuar con Google») tanto para propietarios del panel como para clientes finales en reservas y «Mis citas», aceptando código OAuth PKCE (`code`, `redirectUri`, `codeVerifier`) o `idToken` nativo de Google.
- `POST /api/public/v1/mobile/auth/sign-out`: revoca la sesión Bearer activa.
- `GET /api/v1/mobile/summary`: resumen autenticado del panel para móvil y tablet (`user`, `org` y `calendars`).

## Cobertura de comportamiento

| Área | Éxito | Fracaso y recuperación |
|---|---|---|
| Registro y acceso | Registro ES/EN por HTTP, web y app móvil, verificación, sesión, OTP, login con Google (web y móvil), perfil | Correo inválido/desechable, contraseña corta, nombre vacío/largo/control/bidi/etiquetas, sesión de otro dominio |
| Alta del negocio | Organización, asistente completo, calendario, servicio, horario, feriados | Permisos, límites del plan, valores fuera de rango |
| Reserva pública | Servicio único/múltiple, disponibilidad, hold, OTP, confirmación con Google, embed | Horario ocupado, intento de acceso ajeno, OTP erróneo con reintento, hold caducado, red y reintento |
| Gestión de citas | Consultar, cancelar/liberar horario, reprogramar con revisión, conservar horario actual | Acceso ajeno, conflictos, restricciones de rol y cancelación |
| Panel | Citas, series, bloqueos, edición, configuración, exportar/cerrar/borrar cuenta, 2FA, resumen móvil | Conflictos de series/bloqueos y permisos, borrar cuenta antes de cerrar negocio |
| Móviles y tablets | Teléfonos y tablets Android e iOS (Pixel 8, iPhone 13, Galaxy Tab S9, iPad Pro 11), vista dividida en tablets, sin desbordamiento horizontal | Rechazo en CI de suites móviles, validación previa en cliente móvil, fallo explícito en runner nativo sin artefacto/Appium |
| Avisos e integraciones | Notificaciones, recordatorios, sincronización, feeds, OAuth/MCP y facturación mediante dobles | Idempotencia, permisos, ámbitos, reintentos y estados de error incluidos en las features existentes |
| Base de datos | Migraciones, Unicode y límite exacto, edición válida, cancelación y nueva reserva | UPDATE/INSERT inválidos sin pasar por API, longitudes, JSON mal tipado, controles, FK, unicidad, exclusión de solapes |
| Interfaz | ES/EN, navegación, accesibilidad axe, reflujo, foco en diálogos (WebKit/Chromium), formularios, presupuesto JS | Validación antes de red, error HTTP/red, recuperación y corrección del nombre |

## Reglas de texto compartidas

No existe una longitud universal recomendada para todos los nombres. Se conserva el límite de producto de **120** que ya utilizaba el proyecto y el campo de nombre completo: incluye nombres y apellidos, sin exigir dos apellidos ni separar estructuras culturales. Se permiten Unicode, signos, números y espacios; no se restringe a letras ASCII. Referencia: [W3C, nombres personales e internacionalización](https://www.w3.org/TR/international-specs/). La implementación usa [Zod](https://zod.dev/api) en frontend, móvil y backend.

| Campo | Máximo |
|---|---:|
| Nombre de la persona (cuenta, registro y perfil) | 100 |
| Negocio, tablero, feriado, nombre de servicio por idioma y nombre de asistente | 120 |
| Título y nota de excepción | 200 |
| Dirección | 240 |
| Etiqueta de turno | 60 |
| Motivo de cancelación | 500 |
| Notas del cliente y descripción de servicio por idioma | 1000 |
| Notas internas | 2000 |
| Mensaje de contacto | 4000; mínimo 10 tras recortar |

Las longitudes son unidades UTF-16, como `maxlength`: un emoji astral ocupa dos. Zod en esta versión usa puntos de código para `.max()`, por eso se añade un refinamiento explícito para coincidir con el navegador y SQL. No se normaliza ni cambia la escritura del nombre; se recortan espacios exteriores. Se rechazan controles C0/C1 y controles bidi invisibles. Los campos de una línea también rechazan saltos y `< >`; el texto libre permite tabuladores, CR/LF y puntuación (se sigue renderizando como texto, sin confiar en el contenido como HTML).

## Informes

Cada proyecto deja su informe HTML y Cucumber separados en `tests/escenarios/playwright-report-<proyecto>/` y `cucumber-report-<proyecto>/`, con JSON en `test-results-<proyecto>/results.json`. Los fallos conservan captura, vídeo y traza. El reloj usa el sufijo `reloj`.

Los workflows sólo ejecutan unitarias sin SQL y BDD de escritorio. Las pruebas de integración del backend usan la base del entorno como dependencia de la aplicación; la suite independiente de comprobación directa de bases y Testcontainers está fuera de GitHub. Los proyectos móviles y de tablets (`android`, `ios`, `android-tablet`, `ios-tablet`) y los nativos tienen comandos explícitos y el runner rechaza ejecutarlos con `CI` definido.
