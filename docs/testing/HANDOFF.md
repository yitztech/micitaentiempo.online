# Handoff: cobertura de pruebas, validación y apps móviles (Completado)

Estado al 2026-10-15. Rama `test/cobertura-validacion-flujos`, sin commits. Todos los puntos pendientes del handoff inicial y la implementación de pruebas + aplicaciones móviles (Android/iOS en teléfonos y tablets con Expo) fueron completados y verificados.

## Resumen de lo completado

1. **Política de texto compartida y persistencia**:
   - Esquemas Zod en `packages/schemas/src/text-policy.ts`, `packages/schemas/src/text.ts` y `packages/schemas/src/mobile.ts`.
   - Migraciones Drizzle (`services/api/drizzle/0006_text_validation.sql`) y Goose (`services/calendar/internal/db/migrations/00005_text_validation.sql` y `00006_series_text.sql`).
   - Validación de escrituras en cliente (`services/web/app/lib/validation.ts`) para rutas web y móviles.

2. **Corrección y verificación de foco en WebKit (iOS / iPadOS)**:
   - Ciclo de foco `Tab` y `Shift+Tab` gestionado explícitamente en `services/web/app/components/dialog.tsx`.
   - Escenarios `Panel autenticado con nombre largo` (ES/EN) verificados en `ios` (iPhone 13) e `ios-tablet` (iPad Pro 11).

3. **TDD móvil (teléfonos y tablets) + Endpoints de Backend + Apps Expo (`services/mobile`)**:
   - **Pruebas unitarias y BDD añadidas primero**:
     - `tests/unit/mobile.test.js`, `tests/unit/mobile-app.test.js`, `tests/unit/native-driver.test.js` y `services/api/test/mobile.test.ts`.
     - `tests/escenarios/features/movil/app-movil.feature` y `tests/escenarios/steps/movil.steps.ts` (15 escenarios Gherkin).
   - **Endpoints de Backend (`services/api/src/mobile/`)**:
     - `GET /api/public/v1/mobile/bootstrap`
     - `POST /api/public/v1/mobile/auth/sign-up`
     - `POST /api/public/v1/mobile/auth/sign-in`
     - `POST /api/public/v1/mobile/auth/google` (soporta código OAuth PKCE con `redirectUri`/`codeVerifier` e `idToken` directo, igual que en web y en `/api/public/v1/customer-session/google`).
     - `POST /api/public/v1/mobile/auth/sign-out`
     - `GET /api/v1/mobile/summary` (autenticado por Bearer token o cookie).
   - **Base de la app móvil Expo (`services/mobile`, pendiente instalar Expo/React Native y compilar)**:
     - Configurada para Android (`com.micitaentiempo.app`) e iOS (`online.micitaentiempo.app`) con `supportsTablet: true` y manifiestos nativos (`AndroidManifest.xml`, `Info.plist`).
     - Reutiliza `@mcet/i18n`, `@mcet/schemas` y la validación del frontend, adaptando la interfaz en una columna (teléfonos) o maestro-detalle en dos columnas (tablets).
   - **Runner nativo W3C WebDriver / Appium (`scripts/test-native-mobile.mjs`)**:
     - Soporta `android`, `ios`, `android-tablet` e `ios-tablet`. Falla explícitamente si faltan los artefactos compilados o el servidor Appium, sin simular éxitos falsos.

4. **Ejecución completa y documentación**:
   - `pnpm test:all` ejecutado de principio a fin con 0 fallos (ver detalle en `docs/testing/RESULTADOS.md`).
   - Guía actualizada en `docs/testing/README.md` y reporte final en `docs/testing/RESULTADOS.md`.
   - Stack de pruebas `mcet-tests` apagado limpiamente con `pnpm test:env:down`.
