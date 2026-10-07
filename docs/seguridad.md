# Seguridad: revisión previa al lanzamiento (F12)

Revisión del 2026-10-07 contra OWASP ASVS 5.0, nivel 2, más pruebas automáticas. La seguridad del servidor,
el TLS y las copias son de la plataforma (`docs/plan/08-infraestructura.md` §8.11).

## Pruebas automáticas

| Prueba | Dónde | Resultado |
|---|---|---|
| Secretos en todo el historial (gitleaks 8.30.1) | CI (`secretos`) | 0 hallazgos; 5 valores ficticios de pruebas revisados en `.gitleaksignore` |
| Imágenes (Trivy, críticas con arreglo) | CI (`escenarios`) | Sin hallazgos |
| ZAP baseline 2.17.0 | Nocturno | 0 fallos y 0 avisos; 8 reglas aceptadas y justificadas en `tests/seguridad/zap-reglas.tsv` |
| Cabeceras y CSP en los dos dominios | `@humo-produccion` (local y tras cada despliegue) | En verde |
| Permisos rol × endpoint y rol × herramienta MCP | Escenarios `@critico` y `services/api/test/mcp.test.ts` | En verde |

Arreglos que salieron de la revisión: formularios con `method="post"` (sin JavaScript, la contraseña habría
ido en la URL), `statusText` correcto en los 404, `Cross-Origin-Resource-Policy`, `img-src` sin comodín,
`Cache-Control: no-store` por defecto en la API y en las páginas privadas, y registros sin tokens (consulta
oculta en `api` y en el gateway; ruta de los feeds ICS oculta).

## ASVS 5.0 nivel 2 por capítulo

| Capítulo | Estado | Evidencia |
|---|---|---|
| V1 Codificación y saneamiento | Cumple | React escapa la salida; SQL parametrizado (Drizzle, pgx); Markdown legal solo del repositorio; ICS con `golang-ical`; correos con React Email |
| V2 Validación y lógica de negocio | Cumple | Esquemas Zod compartidos (`packages/schemas`) en REST y MCP; `Idempotency-Key`; apartados de 10 min; restricción `EXCLUDE` contra dobles reservas; ALTCHA en altas y reservas |
| V3 Seguridad del frontend | Cumple | CSP con nonce, `frame-ancestors 'none'` (el embed, con su lista), `X-Frame-Options`, COOP, CORP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS. `style-src 'unsafe-inline'` aceptado (solo estilos) |
| V4 API y servicios web | Cumple | JSON obligatorio en mutaciones, cuerpo ≤ 256 KB, límites por IP en el gateway y por ruta en Better Auth, `problem+json` sin trazas |
| V5 Archivos | No aplica | No hay subida de archivos |
| V6 Autenticación | Cumple | Contraseñas de 12 a 128 caracteres, Argon2id (OWASP), comprobación de filtraciones (HIBP), 10 intentos/min, correo verificado, restablecimiento de 1 h que cierra sesiones; verificación en dos pasos opcional (TOTP con códigos de respaldo y 10 intentos/min) en Panel → Cuenta |
| V7 Sesiones | Cumple | Cookies `__Secure-`, `HttpOnly`, `SameSite=Lax`, por dominio; 7 días con renovación diaria; cierre al cambiar o restablecer la contraseña y al borrar la cuenta |
| V8 Autorización | Cumple | Matriz única (`auth/permissions.ts`) aplicada por `CalendarAccess` en REST y MCP; 404 a quien no es miembro; tableros elegidos en el consentimiento MCP; clientes finales solo ven lo suyo |
| V9 Tokens autocontenidos | Cumple | JWT EdDSA del JWKS, `iss`/`aud`/`exp` comprobados, 15 min, conexión vigente comprobada en cada llamada; JWT internos HS256 de 60 s entre servicios |
| V10 OAuth y OIDC | Cumple | Código + PKCE S256, URI de retorno exactas, `iss` (RFC 9207), recurso (RFC 8707), refresh rotativo, consentimiento con elección de permisos y tableros, CIMD con descarga anti-SSRF, DCR limitado y limpiado; OAuth con Google/Microsoft con `state` y tokens cifrados |
| V11 Criptografía | Cumple | AES-256-GCM con HKDF, HMAC-SHA-256, aleatoriedad del sistema; secretos ≥ 32 caracteres exigidos al arrancar |
| V12 Comunicaciones | Cumple (plataforma) | TLS en Traefik/Coolify; HSTS desde el gateway; tráfico interno en la red de Docker |
| V13 Configuración | Cumple | Secretos solo por entorno; variables obligatorias; `TEST_MODE` prohibido con dominios reales; `server_tokens off`; imágenes sin herramientas de compilación |
| V14 Protección de datos | Cumple | `no-store` en datos de cuenta; enmascarado de contacto en MCP sin `customers:read`; exportación, borrado de la cuenta y cierre del negocio (borra sus datos en el motor) en Panel → Cuenta; IP solo como huella en la auditoría |
| V15 Código y arquitectura seguros | Cumple | Versiones fijadas y verificadas, `minimumReleaseAge` de 24 h en pnpm, Trivy, gitleaks, actualizaciones de dependencias con Dependabot |
| V16 Registro y errores | Cumple | JSON con `request_id`; sin cabeceras de autenticación, cookies ni consultas; auditoría de escrituras (`via` panel/mcp/público) |
| V17 WebRTC | No aplica | |

## Riesgos aceptados

- `style-src 'unsafe-inline'`: lo necesitan los atributos `style` de React y FullCalendar; los scripts van
  con nonce, así que no permite ejecutar código.
- CORS abierto en `/mcp` y en los metadatos OAuth: solo aceptan Bearer, nunca cookies.
- Sin COEP: rompería el embed en webs de terceros y el checkout de Stripe.
- `embed.js` sin SRI: lo copian los negocios y cambia con cada versión.

## Pendiente antes o después del lanzamiento

- Verificación manual de MCP con los clientes reales (`docs/mcp-verificacion.md`).
- Revisión legal de los textos de privacidad y condiciones por un abogado.
