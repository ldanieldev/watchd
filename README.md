# Watchd

A full-stack Nuxt 4 app for automating tracking watch history for anime, tvshows and movies from plex.

## Stack

- Nuxt 4 + Nuxt UI on Bun
- PostgreSQL (Drizzle ORM), Redis, Meilisearch, Inngest
- Auth via `nuxt-auth-utils` (credentials)
- Sentry for errors and traces; pino logs and OpenTelemetry metrics shipped by Grafana Alloy to Loki and Mimir

## Quick start

Requires [Bun](https://bun.sh) 1.4+ and Podman or Docker with compose.

```bash
bun install
podman compose up -d
bun run db:push                                # create the schema
bun run dev
curl -X PUT http://localhost:3000/api/inngest  # register background jobs; re-run when a job changes
```

## Configuration

Copy `.env.example` to `.env` (uncommitted) and fill it in; it already carries the local Inngest values. Required: `DATABASE_URL` and `NUXT_APP_SECRET` (`openssl rand -base64 32`). For local development also set `NUXT_REDIS_URL=redis://localhost:6379/1` and `NUXT_MEILI_HOST=http://localhost:7700`.

- A production build refuses to start with `INNGEST_DEV` set or with default or short (under 32 characters) Inngest keys.
- Metrics are off unless `ENABLE_OPENTELEMETRY=true`; Alloy forwards them and `logs/*.log` to `MIMIR_PUSH_URL` and `LOKI_PUSH_URL`.
- Sentry is off unless `SENTRY_DSN` is set; Session Replay is off unless `NUXT_PUBLIC_SENTRY_REPLAY=true`.
- Sourcemaps upload only when `SENTRY_UPLOAD_SOURCEMAPS=true`, so e2e builds don't cut Sentry releases.

## Development

```bash
bun run lint
bun run typecheck
bun run db:generate    # migration from schema changes
bun run test           # unit + Nuxt component tests (not bare `bun test`)
bun run test:e2e       # Playwright; first run: bunx playwright install chromium
bun run db:studio      # Postgres UI
```

## Deployment

`Dockerfile` builds a single image. The Sentry auth token is a build secret, never an `ARG`, and a build with `SENTRY_UPLOAD_SOURCEMAPS=true` fails without it.

```bash
podman build --secret id=sentry_auth_token,src=<file> \
  --build-arg SENTRY_UPLOAD_SOURCEMAPS=true --build-arg SENTRY_DSN=... --build-arg SENTRY_ORG=... \
  --build-arg GIT_SHA=$(git rev-parse HEAD) -t watchd .
```

The image also ships `.output/migrate.mjs` (applies `drizzle/`) and `.output/inngest-sync.mjs`. `compose.yml` runs the app's dependencies, not the app itself.

No image is published yet (CI publish is deferred), so build it locally. The Sentry args and secret are optional, and the minimal build is `podman build --build-arg GIT_SHA=$(git rev-parse HEAD) -t ghcr.io/ldanieldev/watchd:0.1.0 .`. The production stack's compose file lives in the maintainer's vault note, not in this repo.

Production-relevant variables (all in `.env.example`):

- `NUXT_REGISTRATION`: `open` (default) or `closed`, which allows sign-up only while no users exist.
- `NUXT_TRUST_PROXY`: `true` only behind a reverse proxy you control; rate limiting then keys on the last `X-Forwarded-For` hop.
- `NUXT_PLEX_SYNC_MODE`: `off` (default), `read-only` or `on`.
- `NUXT_PLEX_CLIENT_IDENTIFIER`: use a distinct id per deployment so Plex sees each as its own device.
