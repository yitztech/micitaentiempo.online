# Resultados finales de pruebas y validación

Fecha de ejecución: 2026-10-15  
Rama: `test/cobertura-validacion-flujos`  
Entorno Docker aislado: proyecto `mcet-tests` (`compose.prod.yml` + `compose.ci.yml` + `.env.ci`).

## 1. Resumen de verificación estática y contratos

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Formato y lint (Biome) | `pnpm lint` | ✅ 0 errores (284 archivos verificados; 5 advertencias preexistentes en `delivery.worker.ts` y `app.css` `prefers-reduced-motion`) |
| Traducciones ES/EN | `pnpm i18n:check` | ✅ Paridad completa ES/EN |
| Tipos TypeScript (monorepo + `services/mobile`) | `pnpm typecheck` | ✅ 0 errores |
| Espacios en blanco / parches Git | `git diff --check` | ✅ Sin incidencias |

## 2. Pruebas unitarias (`pnpm test:unit`)

| Suite | Archivos | Tests pasados | Estado |
| --- | --- | --- | --- |
| `tests/unit` (políticas de texto, Zod, validación web, Expo/mobile, driver W3C) | 5 | 36 | ✅ PASS |
| `@mcet/i18n` | 1 | 11 | ✅ PASS |
| `@mcet/api` (incluyendo `test/mobile.test.ts` y `test/text-validation.test.ts`) | 29 | 166 | ✅ PASS |
| `@mcet/web` (incluyendo foco circular Tab/Shift+Tab en `dialog.test.ts`) | 3 | 14 | ✅ PASS |
| `services/calendar` (`go test -short -race ./...`) | 10 paquetes | Todos | ✅ PASS |
| **Total unitarias JS/TS** | **38** | **227** | **✅ PASS** |

## 3. Pruebas de base de datos (`pnpm test:db` — sólo local)

- `vitest.database.config.ts` (`tests/database/text-constraints.db.test.ts`): **15 tests pasados** (verifica constraints `CHECK` e inserciones SQL directas en `mcet_api` y `mcet_calendar`, además de paridad de migraciones Drizzle y Goose).
- `services/calendar` (`go test -race ./internal/engine/... ./internal/outbox/...`): **PASS** contra PostgreSQL local (`localhost:5232`).

## 4. Escenarios Gherkin / Playwright (`pnpm test:behavior` y `pnpm test:mobile`)

Ejecutados contra el stack `mcet-tests` reconstruido:

| Proyecto Playwright | Dispositivo / Viewport | Motor | Escenarios pasados | Fallidos |
| --- | --- | --- | --- | --- |
| `escritorio` | Desktop Chrome (1280×720) | Chromium | 170 | 0 |
| `reloj` | Desktop Chrome (`@reloj` aislado) | Chromium | 8 | 0 |
| `android` | Pixel 8 (412×915) | Chromium | 92 | 0 |
| `ios` | iPhone 13 (390×844) | WebKit | 92 | 0 |
| `android-tablet` | Galaxy Tab S9 (800×1280) | Chromium | 92 | 0 |
| `ios-tablet` | iPad Pro 11 (834×1194) | WebKit | 92 | 0 |

### Cobertura destacada añadida
- **Foco en diálogos WebKit (`ios` y `ios-tablet`)**: los escenarios `Panel autenticado con nombre largo` (ES y EN) de `features/diseno/qa-cliente.feature` pasaron sin errores tras la gestión explícita de ciclo `Tab` / `Shift+Tab` en `services/web/app/components/dialog.tsx`.
- **Endpoints y flujos móviles (`features/movil/app-movil.feature`)**: 15 escenarios nuevos cubriendo:
  - `GET /api/public/v1/mobile/bootstrap` (ES/EN, esquemas profundos, proveedor Google y contratos de selectores).
  - `POST /api/public/v1/mobile/auth/sign-up`, `sign-in`, `google` (código OAuth PKCE e `idToken`) y `sign-out`.
  - `GET /api/v1/mobile/summary` con token Bearer para panel móvil/tablet.
  - Validación de límites y caracteres de control en rutas móviles.
  - Flujos de reserva, inicio de sesión con Google, confirmación de cita y cancelación en «Mis citas» desde teléfonos y tablets (`android`, `ios`, `android-tablet`, `ios-tablet`).

## 5. Apps móviles Expo (`services/mobile`) y runner nativo Appium/W3C

- Se preparó `services/mobile/` (configuración Expo, manifiestos y lógica compartida; **aún sin dependencias de Expo/React Native, por lo que todavía no compila un .apk/.app**), reutilizando `@mcet/i18n`, `@mcet/schemas`, el cliente de validación y los selectores compartidos con `services/web`.
- El adaptador nativo W3C WebDriver (`scripts/test-native-mobile.mjs`) fue verificado con un servidor W3C simulado en `tests/unit/native-driver.test.js` (4 perfiles: `android`, `ios`, `android-tablet`, `ios-tablet`, más pruebas de fallo explícito cuando faltan `ANDROID_APP_PATH` / `IOS_APP_PATH` o el servidor Appium).
- **Pendiente para dispositivo físico / emulador nativo compilado**:
  - Compilar el binario `.apk` (Android SDK) o `.app` de simulador (Xcode en macOS) desde `services/mobile`.
  - Levantar Appium (`127.0.0.1:4723`) con `uiautomator2` / `xcuitest` y exportar `ANDROID_APP_PATH` y/o `IOS_APP_PATH` antes de ejecutar `pnpm test:native:mobile`.
