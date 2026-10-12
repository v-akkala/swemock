# syntax=docker/dockerfile:1
# Build context: repository root.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG PNPM_VERSION=12.11.2

FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY services/runner/package.json services/runner/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @swemock/runner...
COPY services/runner services/runner
COPY packages/shared packages/shared
RUN pnpm --filter @swemock/runner build

# The bundle has no runtime dependencies. Runs as root only to reach the Docker socket;
# compose makes the filesystem read-only and drops all capabilities.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/services/runner/dist/main.mjs ./main.mjs
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "main.mjs"]
