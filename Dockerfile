# syntax=docker/dockerfile:1
# Production image: build once, run the bundled server as an unprivileged user.
#   docker build -t launchpad .
#   docker run -p 8080:8080 --env-file .env.production launchpad
# Health checks: liveness GET /api/health, readiness GET /api/ready (runs SELECT 1 on Postgres).
# Database migrations are not run by the container: run `npm run db:migrate` before deploying
# (scripts/deploy-cloudrun.sh does this).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN NODE_ENV=production npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
# tini-free: node handles SIGTERM itself (graceful drain in server.ts).
CMD ["node", "--enable-source-maps", "dist/server.cjs"]
