# TLE OS on Railway, built from this file (8 Nov 2026).
#
# Why a Dockerfile: Railway's default builder (Railpack) downloads a tool
# called mise from GitHub on every build. On 8 Nov GitHub timed out on
# Railway's build machines for over an hour and every deploy failed before
# our code was even built. Everything here comes from Docker Hub and npm, so a
# GitHub outage no longer stops a deploy. Delete this file to go back to
# Railpack exactly as it was.
#
# Same as before: Node 22, `npm run build`, started with `next start`
# (NOT standalone - see next.config.ts).

FROM node:22-bookworm-slim AS build
WORKDIR /app

# What the build itself reads (next.config.ts): the build stamp, the site's
# own address for emails, and the browser's maps key. Railway hands a service
# variable to a Dockerfile build only when it is named here.
ARG RAILWAY_GIT_COMMIT_SHA
ARG RAILWAY_PUBLIC_DOMAIN
ARG RAILWAY_ENVIRONMENT
ARG OS_ORIGIN
ARG PORTAL_ORIGIN
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA \
    RAILWAY_PUBLIC_DOMAIN=$RAILWAY_PUBLIC_DOMAIN \
    RAILWAY_ENVIRONMENT=$RAILWAY_ENVIRONMENT \
    OS_ORIGIN=$OS_ORIGIN \
    PORTAL_ORIGIN=$PORTAL_ORIGIN \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
# Railway sets PORT; `next start` listens on it.
CMD ["npm", "start"]
