# Sails Protocol — production server image (2026-08-02)
#
# Built for AWS App Runner's "source code repository" build path, but
# runs anywhere a plain OCI image does. bookworm-slim (glibc), not
# alpine — this project's real native dependencies (sodium-native,
# tiny-secp256k1) either ship no prebuilt musl binaries or are markedly
# less reliable to compile against musl; glibc is the boring, correct
# choice for this dependency set, not a default left unexamined.
#
# Builds exactly what `npm run build` already builds locally (verified
# throughout this repo's own history) — no separate build logic invented
# for Docker. Does NOT run `prisma migrate`/`db push` here: schema
# changes are applied as their own explicit step against the target
# database (see docs/DEPLOYMENT.md), never implicitly on container start,
# so a bad migration can't silently run every time the service restarts.

FROM node:20-bookworm-slim AS builder

# python3/make/g++: required to build this project's native addons
# (sodium-native, tiny-secp256k1) from source when no matching prebuilt
# binary is available for the target platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Full monorepo context — see .dockerignore for what's actually excluded
# (host node_modules, dist/, .git, examples' own build caches, etc.).
# npm workspaces resolve as one dependency graph; there is no supported
# way to install only a subset of workspaces without risking a lockfile
# mismatch against what's actually tested locally, so this installs the
# same full tree `npm install` already does on every contributor's
# machine — not a from-scratch Docker-specific dependency resolution.
COPY . .

RUN npm ci

# Same build this repo's own package.json script runs everywhere else:
# @sails/p2p-schemas -> @sails/sdk -> the server's own tsc.
RUN npm run build

# Drop devDependencies now that the build output exists — the runtime
# stage below only needs what's left after this.
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only what src/main.js actually needs at runtime: the pruned
# node_modules tree, the compiled server, the Prisma schema (the
# generated client's query engine reads it), and package.json (Node's
# own module resolution wants it present for the "type"/"main" fields).
#
# node_modules/@sails/sdk and @sails/p2p-schemas are npm-workspaces
# SYMLINKS (to ../../packages/<name>), not real copies — Docker COPY
# preserves symlinks as-is, so their *targets* must exist at the same
# relative path in this stage too, or the require() they point at 404s
# at container start. Both dist/ (the built JS) and package.json (whose
# "main"/"exports" field is what actually gets resolved through the
# symlink) are copied for each; src/tsconfig/tests are not needed here.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/sails-p2p-schemas/dist ./packages/sails-p2p-schemas/dist
COPY --from=builder /app/packages/sails-p2p-schemas/package.json ./packages/sails-p2p-schemas/package.json
COPY --from=builder /app/packages/sails-sdk/dist ./packages/sails-sdk/dist
COPY --from=builder /app/packages/sails-sdk/package.json ./packages/sails-sdk/package.json

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
