# Gateway de producción (Coolify). Se construye desde la raíz del repositorio:
#   docker build -f services/gateway/Dockerfile --build-arg RELEASE_SHA=<sha> .
# La configuración va dentro de la imagen: el VPS solo descarga y arranca.
FROM nginx:1.31.0-alpine

ARG RELEASE_SHA=dev
ENV RELEASE_SHA=${RELEASE_SHA} \
    RATE_AUTH=10r/m \
    RATE_PUBLIC=120r/m \
    RATE_MCP=120r/m \
    RATE_ICS=30r/m \
    BURST_AUTH=10 \
    BURST_PUBLIC=40 \
    # El entrypoint de nginx solo sustituye estas variables en la plantilla
    NGINX_ENVSUBST_FILTER='^(TRUSTED_PROXY_CIDR|RELEASE_SHA|RATE_[A-Z]+|BURST_[A-Z]+)$'

COPY services/gateway/nginx.conf /etc/nginx/nginx.conf
COPY services/gateway/snippets/ /etc/nginx/snippets/
COPY services/gateway/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
