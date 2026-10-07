# syntax=docker/dockerfile:1
# Imagen de `web`. Se construye desde la raíz del repositorio:
#   docker build -f services/web/Dockerfile --build-arg RELEASE_SHA=<sha> .
FROM node:26.10.0-alpine3.24 AS base
RUN npm install -g pnpm@12.9.1
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@mcet/web..."

# Desarrollo local (compose.yml): servidor con recarga; Compose Watch sincroniza el código.
FROM deps AS dev
RUN pnpm --filter "@mcet/web^..." build
WORKDIR /repo/services/web
CMD ["pnpm", "dev"]

FROM deps AS build
RUN pnpm --filter "@mcet/web..." build \
 && pnpm --filter @mcet/web deploy --prod --legacy /out \
 && find /out/node_modules -type d -path "*/fastify/test" -prune -exec rm -rf {} + \
 && ! find /out -iname "*esbuild*" | grep .

FROM node:26.10.0-alpine3.24
ARG RELEASE_SHA=dev
ENV NODE_ENV=production \
    RELEASE_SHA=${RELEASE_SHA} \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# La imagen de ejecución no necesita gestores de paquetes: sin npm/corepack hay menos superficie y
# menos CVE (tar, undici…) que no son de la aplicación.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
USER node
EXPOSE 3000
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]
