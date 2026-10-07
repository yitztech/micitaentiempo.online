# Mi Cita en Tiempo

Web de https://micitaentiempo.online. Se despliega en la plataforma de yitztech: GitHub Actions publica
imágenes en GHCR y Coolify las arranca en el servidor. El servidor nunca compila.

## Cómo se trabaja

- `main` solo cambia por pull request, y cada PR necesita la aprobación de @yprevot.
  Un push nuevo al PR anula la aprobación anterior.
- Lo que llega a `main` se despliega solo (workflow de despliegue, abajo).

## Contrato con la plataforma

Antes del primer despliegue, el repositorio debe tener:

1. **`compose.prod.yml`**: el compose de producción.
   - El servicio **`gateway`** recibe todo el tráfico, en el puerto **80**. Es el único con
     dominio; el resto de servicios hablan entre ellos por la red del compose.
   - **Sin `ports:`**: solo el proxy de la plataforma (Traefik) llega a `gateway`.
   - **Todo servicio lleva `mem_limit`**: varios clientes comparten servidor. El alta se detiene si falta.
   - Imágenes `${IMAGE_PREFIX}-<servicio>:${IMAGE_TAG}`, publicadas por el workflow. Nada de `build:`.
   - La configuración va dentro de las imágenes: el compose no monta archivos del repositorio.
2. **`/version.json`** servido por `gateway` con `{"revision":"<sha del commit>"}`: el workflow lo
   consulta para dar el despliegue por bueno.
3. **`.github/workflows/deploy.yml`**: en cada push a `main`, publica las imágenes en
   `ghcr.io/yitztech/micitaentiempo.online-<servicio>` y llama al webhook de Coolify con los secretos `COOLIFY_WEBHOOK`
   y `COOLIFY_TOKEN` del entorno `production` (`POST`, cabecera `Authorization: Bearer`). Esos secretos y la
   variable `SITE_URL` los pone la plataforma; el entorno solo acepta despliegues desde `main`.

Variables que la plataforma pasa al compose (se usan las que haga falta):

| Variable | Para qué |
|---|---|
| `SITE_URL` | URL pública (`https://micitaentiempo.online`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Correo transaccional (`no-reply@micitaentiempo.online`) |
| `LISTMONK_URL`, `LISTMONK_LIST_UUID` | Alta en la newsletter |
| `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID` | Analítica |
| `TRUSTED_PROXY_CIDR` | Subred del proxy: solo de ahí se acepta `X-Forwarded-For` |

Otros secretos (base de datos, claves de la app) se piden a la plataforma: los genera y los pasa como variables.

## Dos dominios, uno por idioma

La misma app responde en **https://micitaentiempo.online** (`es`) y en
**https://myappointmentontime.online** (`en`). El proxy pasa el `Host` original: el idioma
se decide por el dominio, nunca por `Accept-Language` ni por la IP.

Variables adicionales (las de arriba, sin sufijo, son las de `es`):

| Variable | Para qué |
|---|---|
| `IDIOMAS` | `es,en`: el primero es el principal |
| `SITE_URL_<IDIOMA>` | URL pública de cada idioma (`SITE_URL_ES`, `SITE_URL_EN`) |
| `SMTP_USER_<IDIOMA>`, `SMTP_PASSWORD_<IDIOMA>`, `MAIL_FROM_<IDIOMA>` | Correo transaccional desde el dominio del idioma del usuario |
| `LISTMONK_URL_<IDIOMA>`, `LISTMONK_LIST_UUID_<IDIOMA>` | Newsletter: un Listmonk por idioma, en `news.` de cada dominio |

Lo que debe hacer la app:

- Elegir el idioma por el `Host` y ponerlo en `<html lang>`. Un `Host` desconocido usa el principal.
- En cada página, `<link rel="alternate" hreflang>` hacia su equivalente en el otro dominio, más
  `x-default`, y un `canonical` en su propio dominio. Un `sitemap.xml` y un `robots.txt` por dominio.
- Rutas traducidas con un mapa común (`/citas` ↔ `/appointments`) para enlazar cada página con su par.
- Ofrecer el otro idioma con un enlace, sin redirigir solo: los buscadores rastrean en inglés.
- Sesiones por dominio: la cookie de un dominio no vale en el otro. Guardar el idioma del usuario en su
  cuenta y enviarle los correos en ese idioma, desde su dominio.
- Login con Google: los dos orígenes y las dos URI de redirección en el cliente OAuth, y las páginas de
  privacidad y condiciones en cada dominio.
- Fechas en UTC en la base de datos; mostrarlas en la zona horaria del usuario.

Ejemplo completo que cumple el contrato: [yitztech/plantilla-cliente](https://github.com/yitztech/plantilla-cliente).
