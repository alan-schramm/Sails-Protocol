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

# --ignore-scripts: found the hard way (first real `docker build` attempt,
# 2026-08-03) — `redis-memory-server`/`embedded-postgres` (devDependencies
# used only for local test infra, see docs/DEPLOYMENT.md section 3) each
# have a postinstall that tries to compile/download a full server binary
# from source (Redis with RedisBloom/RediSearch/RedisJSON modules, in
# redis-memory-server's case — needs cmake/pkg-config/a Python
# interpreter, none of which this image has or needs). Neither package is
# ever imported by the production server; skipping install scripts
# entirely avoids paying for infrastructure this image will never use.
# The one script that DOES matter — `@prisma/client`'s own `prisma
# generate` — is run explicitly right after, since skipping scripts
# means it no longer fires automatically.
RUN npm ci --ignore-scripts
RUN npx prisma generate

# Same build this repo's own package.json script runs everywhere else:
# @sails/p2p-schemas -> @sails/sdk -> the server's own tsc.
RUN npm run build

# `builder` (this exact point, full devDependencies still present) is
# what docker-compose.yml's local `migrate`/`app` services target
# directly — local dev wants `pino-pretty`'s readable logs (app.ts only
# enables that transport when NODE_ENV=development, and devDependencies
# have to actually be present for it to load) and the real `prisma` CLI.
# Production, below, prunes them — a separate named stage so "local dev
# wants devDependencies, production must not ship them" doesn't fight
# itself in one stage (found the hard way, 2026-08-03: pointing
# docker-compose at this stage `AS builder` after the prune already ran
# crashed on the exact same missing-pino-pretty error the runtime image
# has, defeating the entire reason to target `builder` in the first
# place).
FROM builder AS pruned
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
#
# packages/sails-sdk/node_modules/@noble — found the hard way (first
# real `docker run`, 2026-08-03): npm nests a SEPARATE @noble/curves
# v2.x here because escrow-key.ts/kms-signer.ts need it, while the root
# tree stays on v1.2.0 for everything else (that version split is
# exactly what those two files' own header comments already disclose).
# Without this nested copy, Node's module resolution silently falls
# through to the root's incompatible v1.2.0 and crashes at import time
# with ERR_PACKAGE_PATH_NOT_EXPORTED — invisible in `npm test` (Jest's
# own transformIgnorePatterns sidesteps this entirely, see
# jest.config.js's own comment) and invisible in every `tsc --noEmit`/
# `npm run build` check this repo has ever run, since none of those
# actually execute the compiled output the way `node dist/src/main.js`
# does. Only a real run of the built artifact surfaces it.
COPY --from=pruned /app/node_modules ./node_modules
COPY --from=pruned /app/dist ./dist
COPY --from=pruned /app/prisma ./prisma
COPY --from=pruned /app/package.json ./package.json
COPY --from=pruned /app/packages/sails-p2p-schemas/dist ./packages/sails-p2p-schemas/dist
COPY --from=pruned /app/packages/sails-p2p-schemas/package.json ./packages/sails-p2p-schemas/package.json
COPY --from=pruned /app/packages/sails-sdk/dist ./packages/sails-sdk/dist
COPY --from=pruned /app/packages/sails-sdk/package.json ./packages/sails-sdk/package.json
COPY --from=pruned /app/packages/sails-sdk/node_modules ./packages/sails-sdk/node_modules

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
