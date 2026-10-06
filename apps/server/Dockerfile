# The game server: one Node process holding the rounds, deployed to Fly.io near NYC.
# Build from the repo root (the server depends on the workspace's data and engine packages):
#   fly deploy            # uses ./fly.toml, which points here
#
# tsx runs the TypeScript directly, as `pnpm dev:server` does; the dataset JSON is in the
# repo, so nothing is downloaded at build time.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

# Manifests first, so a code change doesn't reinstall.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/data/package.json packages/data/
COPY packages/engine/package.json packages/engine/
RUN pnpm install --frozen-lockfile --filter @stand-clear/server...

COPY apps/server apps/server
COPY packages/data packages/data
COPY packages/engine packages/engine

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["pnpm", "--filter", "@stand-clear/server", "start"]
