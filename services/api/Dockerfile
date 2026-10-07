# syntax=docker/dockerfile:1
# Imagen de `api`. Se construye desde la raíz del repositorio:
#   docker build -f services/api/Dockerfile --build-arg RELEASE_SHA=<sha> .
FROM node:24.21.0-alpine3.24 AS base
RUN npm install -g pnpm@12.9.1
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@mcet/api..."

# Desarrollo local (compose.yml): servidor con recarga; Compose Watch sincroniza el código.
FROM deps AS dev
RUN pnpm --filter "@mcet/api^..." build
WORKDIR /repo/services/api
CMD ["pnpm", "dev"]

FROM deps AS build
RUN pnpm --filter "@mcet/api..." build \
 && pnpm --filter @mcet/api deploy --prod --legacy /out
# better-auth declara drizzle-kit y vitest como peers opcionales y pnpm los deja en el árbol de
# producción con sus propios esbuild y vite. Nunca se cargan en ejecución: se quitan aquí y la
# construcción falla si queda alguna herramienta de desarrollo (esbuild, vite, vitest, drizzle-kit, tsx).
RUN cd /out/node_modules/.pnpm \
 && rm -rf esbuild@* @esbuild+* @esbuild-kit+* drizzle-kit@* vitest@* @vitest+* vite@* tsx@* \
 && rm -rf node_modules/esbuild node_modules/@esbuild node_modules/@esbuild-kit node_modules/.bin/esbuild \
           node_modules/drizzle-kit node_modules/vitest node_modules/vite node_modules/tsx \
 && find /out/node_modules \( -type l -o -path "*/.bin/*" \) \
      \( -name esbuild -o -name @esbuild -o -name @esbuild-kit -o -name vite -o -name vitest -o -name drizzle-kit -o -name tsx \) -delete \
 && find -L /out/node_modules -type l -exec rm -f {} + \
 && find /out/node_modules -type d -path "*/fastify/test" -prune -exec rm -rf {} + \
 && ! find /out -name "*esbuild*" | grep . \
 && ! ls /out/node_modules/.pnpm | grep -E '^(@?esbuild|vite@|vitest@|drizzle-kit@|tsx@)'

FROM node:24.21.0-alpine3.24
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
EXPOSE 3000 3001
CMD ["node", "--enable-source-maps", "dist/main.js"]
