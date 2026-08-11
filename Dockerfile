# syntax=docker/dockerfile:1

# One image, two processes, one port. What comes out is a runtime that has the
# app and nothing to build it with: no compiler, no sources, no dev packages.

ARG NODE=node:22-bookworm-slim

# ---------------------------------------------------------------- dependencies
# Only the manifests are copied first, so this layer is rebuilt when a
# dependency changes and not every time somebody edits a line of code.
FROM ${NODE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci

# ----------------------------------------------------------------------- build
FROM deps AS build
WORKDIR /repo
COPY . .
RUN npm run build
# Next leaves these out of the standalone bundle because a real deployment
# usually puts them on a CDN. There is no CDN here, so the server serves them.
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

# ------------------------------------------------------------ runtime packages
# The same lockfile, resolved for two workspaces instead of all three: the API
# never imports Next, and asking for it by name leaves ~450MB of build tooling
# out of the image. What the web app needs travels inside its own bundle.
FROM ${NODE} AS server-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @agent-org/server --workspace @agent-org/shared

# --------------------------------------------------------------------- runtime
FROM ${NODE} AS runtime

# `python3` is the interpreter the agent's scripts run in and `bubblewrap` is
# what takes the network and the filesystem away from it. Without bubblewrap the
# tool is not offered at all — it is never run unpenned — so the app still works,
# it just cannot compute anything over the records it pulled.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 bubblewrap \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Laid out the way the repo is: the server finds its data directory by counting
# up from its own file, so `dist` has to sit at the depth it was built at.
COPY --from=server-deps /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/scripts ./scripts
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
COPY --from=build /repo/apps/server/dist ./apps/server/dist
# The web app keeps its own `node_modules` — the one Next traced — so the two
# never have to agree on a single tree.
COPY --from=build /repo/apps/web/.next/standalone ./web

# Everything the company owns lives here and it is the only thing worth keeping
# across deploys. Made before dropping to `node` so the volume is theirs.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
VOLUME ["/app/.data"]

ENV PORT=3100
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/start.mjs"]
