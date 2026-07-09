# Build context is the repo root (the workspace install needs the lockfile):
#   docker build -f apps/peerserver/Dockerfile -t peerserver .
FROM node:24-alpine AS build
# Pin pnpm to the workspace's packageManager version.
RUN npm install -g pnpm@9.15.0
WORKDIR /repo
COPY . .
# --ignore-scripts: the root `prepare` hook (simple-git-hooks) needs .git,
# which is excluded from the context; no dependency here needs a postinstall.
RUN pnpm install --frozen-lockfile --filter @release/peerserver... --ignore-scripts
RUN pnpm --filter @release/peerserver build
# Standalone production bundle: no workspace symlinks, prod deps only.
RUN pnpm --filter @release/peerserver deploy --prod /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-9000}/health" || exit 1
CMD ["node", "dist/index.js"]
