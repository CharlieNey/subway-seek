# The game server: one Node process holding the rounds, run on one EC2 instance in
# us-east-1 behind Caddy (infra/aws). Build from the repo root, since the server depends on
# the workspace's data and engine packages:
#   docker build -f apps/server/Dockerfile .      # infra/aws/deploy.sh does this and pushes to ECR
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
# Match logs and the sessions database live under /data (a volume in production). The
# process runs as `node`, so the directory has to be its own; a named volume takes the
# image's ownership the first time it's created.
RUN mkdir -p /data/logs && chown -R node:node /data
VOLUME /data
USER node
CMD ["pnpm", "--filter", "@stand-clear/server", "start"]
