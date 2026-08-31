# Watchd

A full-stack Nuxt 4 app for automating tracking watch history for anime, tvshows and movies from plex.

## Stack

- **Runtime / package manager**: Bun
- **Framework**: Nuxt 4 + Nuxt UI (Tailwind)
- **Database**: PostgreSQL via Drizzle ORM
- **Cache / queue**: Redis
- **Search**: Elasticsearch
- **Auth**: `nuxt-auth-utils` (credentials)
- **Background jobs**: Inngest
- **Errors / tracing**: Sentry
- **Tests**: Vitest (unit + Nuxt) and Playwright (E2E)

## Prerequisites

- [Bun](https://bun.sh) 1.4+ — `curl -fsSL https://bun.sh/install | bash`
- [Podman](https://podman.io) with the `compose` plugin (or `podman-compose`)

## Getting started

```bash
bun install
podman compose up -d          # postgres, redis, inngest, elasticsearch, UIs
bun run db:push               # create the schema — nothing works without this
bun run dev
```

Create a `.env` first — there is no committed template, since the file holds real credentials. Minimum to boot:

```bash
# Read by the app
NUXT_SESSION_PASSWORD=                                              # 32+ random chars
DATABASE_URL=postgres://postgres:postgres@localhost:5432/watchd

# Read by compose
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=watchd
REDIS_URL=redis://redis:6379                                        # container hostname
```

`REDIS_URL` uses the service name rather than `localhost` because only containers resolve it — Inngest, from inside the compose network. Anything running on the host needs `localhost` instead, which is why `DATABASE_URL` differs.

Optional: `APP_NAME`, `PORT`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ES_JAVA_OPTS`, and the `*_PORT` overrides below. `ELASTICSEARCH_URL` is reserved and not read anywhere yet. Sentry stays off unless `SENTRY_DSN` is set; `SENTRY_AUTH_TOKEN` and `SENTRY_ORG` are build-time only, for sourcemap upload.

Upload is gated behind `SENTRY_UPLOAD_SOURCEMAPS=true`, which only the `Dockerfile` sets. The plugin would otherwise upload maps and cut a release on *every* production build — and `@nuxt/test-utils` does one per E2E run, so a plain `bun run test:e2e` was creating Sentry releases. Leave it unset everywhere except a real release build; runtime error reporting does not depend on it.

## Scripts

| Script | Does |
| --- | --- |
| `dev` / `build` / `preview` | Nuxt dev server, production build, preview the build |
| `lint` / `typecheck` | ESLint, `vue-tsc` |
| `db:push` | Push the schema straight to the database. Dev only |
| `db:generate` | Write a versioned SQL migration to `./drizzle` from schema changes |
| `db:migrate` | Apply pending migrations. Use this, not `db:push`, for deploys |
| `db:check` | Check migrations for collisions |
| `db:studio` | Drizzle Studio, the Postgres UI, on :4983 |
| `test` | Vitest, both projects |
| `test:unit` / `test:nuxt` | One Vitest project only |
| `test:e2e` / `test:e2e:ui` | Playwright, headless or with the UI runner |

E2E can also run fully containerised, against the compose network:

```bash
podman compose --profile test run --rm playwright
```

## Services

| Service | URL | Notes |
| --- | --- | --- |
| App | http://localhost:3000 | `bun run dev` |
| Postgres | localhost:5432 | |
| Redis | localhost:6379 | |
| Inngest | http://localhost:8288 | Dev server UI |
| Elasticsearch | http://localhost:9200 | `ELASTICSEARCH_PORT` |
| elasticvue | http://localhost:8080 | Elasticsearch browser, `ELASTICVUE_PORT` |
| RedisInsight | http://localhost:5540 | Redis browser, `REDISINSIGHT_PORT` |
| Drizzle Studio | https://local.drizzle.studio | `bun run db:studio` |

## Logging and errors

Exceptions go to Sentry from both runtimes automatically — no `captureException` calls needed, except where you catch an error and still want it reported. Handled 4xx (`createError({ statusCode: 400 })`) are deliberately not sent.

Operational logs go to stdout as JSON via `shared/utils/logger.ts`, for a Grafana Alloy collector to ship into Loki. Every request carries a `requestId`, tagged on the Sentry event and included in every log line, so an issue can be traced back to its log narrative.

```ts
import { logger } from '~~/shared/utils/logger'

const log = logger.withTag('api:users')
log.info('user fetched', { userId, requestId: event.context.requestId })
```

Log identifiers and outcomes, never payloads — `userId: 4471`, not the whole `user` object. Field names matching `pass|token|secret|auth|cookie|session|email|...` are redacted automatically, but anything interpolated into the message string is not.

Level is set by `CONSOLA_LOG_LEVEL` (a name like `info`, or a number). It defaults to `warn` in production and `debug` in development, so the per-request `info` narrative is off by default in prod — raise it when investigating.

## Deployment

`Dockerfile` builds a single image; Nitro bundles everything into `.output`, and the runtime stage carries only that. The Sentry auth token is passed as a build secret rather than an `ARG`, so it does not persist in the image history. This is also the only build that sets `SENTRY_UPLOAD_SOURCEMAPS=true`, so it is the only one that uploads sourcemaps and creates a release.

```bash
podman build --secret id=sentry_auth_token,src=<file> \
  --build-arg SENTRY_DSN=... --build-arg SENTRY_ORG=... -t watchd .
```

`compose.yml` runs the app's dependencies, not the app itself.
