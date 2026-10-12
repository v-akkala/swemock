# syntax=docker/dockerfile:1
# Build context: repository root.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG PNPM_VERSION=12.11.2

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo

# Contributors' hot-reload image (compose.dev.yml mounts the source over /repo).
FROM base AS dev
ENV SWEMOCK_DATA_DIR=/data
# Pre-create the volume mount points so the named volumes in compose.dev.yml are owned by `node`.
RUN mkdir -p /data /repo/node_modules /repo/apps/web/node_modules /repo/apps/web/.next /repo/packages/shared/node_modules \
  && chown -R node:node /data /repo
USER node
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm --filter @swemock/web exec next dev -H 0.0.0.0 -p 3000"]

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @swemock/web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SWEMOCK_DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# The named volume takes this directory's ownership on first mount.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
