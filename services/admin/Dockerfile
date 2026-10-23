# syntax=docker/dockerfile:1
# Imagen de `admin`. Se construye desde la raíz del repositorio:
#   docker build -f services/admin/Dockerfile --build-arg RELEASE_SHA=<sha> .
FROM node:24.22.0-alpine3.24 AS base
RUN npm install -g pnpm@12.9.1
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@mcet/admin..."

# Desarrollo local (compose.yml): servidor con recarga; Compose Watch sincroniza el código.
FROM deps AS dev
# Sus dependencias del monorepo no tienen script build (solo @mcet/tsconfig): --if-present
RUN pnpm --filter "@mcet/admin^..." run --if-present build
WORKDIR /repo/services/admin
CMD ["pnpm", "dev"]

FROM deps AS build
RUN pnpm --filter "@mcet/admin..." build \
 && pnpm --filter @mcet/admin deploy --prod --legacy /out \
 && cp -r /repo/services/admin/public /out/public \
 && find /out/node_modules -type d -path "*/fastify/test" -prune -exec rm -rf {} +

FROM node:24.22.0-alpine3.24
ARG RELEASE_SHA=dev
ENV NODE_ENV=production \
    RELEASE_SHA=${RELEASE_SHA} \
    PORT=3000 \
    ADMIN_DATA_DIR=/data
WORKDIR /app
RUN mkdir -p /data && chown -R node:node /data /app
COPY --from=build --chown=node:node /out ./
# La imagen de ejecución no necesita gestores de paquetes: sin npm/corepack hay menos superficie y
# menos CVE (tar, undici…) que no son de la aplicación.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
