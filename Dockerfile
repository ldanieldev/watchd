# syntax=docker/dockerfile:1.7

# Base
FROM docker.io/oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies (cached layer)
FROM base AS install

RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Build
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# The client DSN is public and gets baked into the prerendered payload at build time,
# so it has to be present here rather than only at runtime.
ARG SENTRY_DSN
ARG SENTRY_ORG
ENV SENTRY_DSN=${SENTRY_DSN} \
    SENTRY_ORG=${SENTRY_ORG}

# Secret mount rather than ARG: an ARG would persist in the image history.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    SENTRY_UPLOAD_SOURCEMAPS=true \
    bun run build

# Production
FROM base AS release

# Nitro bundles everything - only need .output
COPY --from=build /usr/src/app/.output .output

USER bun
EXPOSE 3000/tcp

CMD ["bun", "--bun", ".output/server/index.mjs"]
