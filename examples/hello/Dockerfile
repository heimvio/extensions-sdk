# syntax=docker/dockerfile:1.7
#
# heimvio extension "hello": Angular frontend + Node backend in one image.
# Build context is the repository root (the SDK packages are built from source):
#
#   GITHUBPACKAGESTOKEN=$(gh auth token) docker build \
#     --secret id=npm_token,env=GITHUBPACKAGESTOKEN \
#     -f examples/hello/Dockerfile -t ext-hello .
#
# The npm token (read:packages, for @heimvio/* from GitHub Packages) is a
# BuildKit secret only: it is written to ~/.npmrc inside one RUN and removed
# in the same RUN, so it is in no layer, no ARG and no ENV.

FROM node:24-slim AS build
WORKDIR /src
ENV CI=true NG_CLI_ANALYTICS=false
# Everything except what Dockerfile.dockerignore leaves out (node_modules, dist, .git).
COPY . .
RUN --mount=type=secret,id=npm_token,required=true \
    --mount=type=cache,target=/root/.npm,sharing=locked \
    set -eu; \
    trap 'rm -f /root/.npmrc' EXIT; \
    printf '//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/npm_token)" > /root/.npmrc; \
    npm ci --no-audit --no-fund
RUN npm run build -w @heimvio/ext-sdk-angular -w @heimvio/ext-sdk-node -w @heimvio/ext-hello

# Runtime: the backend is one esbuild bundle (no node_modules), the frontend static files.
FROM node:24-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/heimvio/extensions-sdk" \
      org.opencontainers.image.description="heimvio example extension: Hello <user> (<organisation>)" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=8080 \
    HEIMVIO_EXT_SLUG=hello \
    HEIMVIO_EXT_BASE=/apps/hello/ \
    HEIMVIO_API_BASE=http://heimvio-api:8081
WORKDIR /app
COPY --from=build /src/examples/hello/dist/server ./server
COPY --from=build /src/examples/hello/dist/web ./web
# Read-only root filesystem friendly: nothing is written at runtime.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/main.mjs"]
