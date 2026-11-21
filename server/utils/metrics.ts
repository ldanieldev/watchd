import { metrics, type Counter, type Histogram } from '@opentelemetry/api'

// Built on first use: a meter taken before server/plugins/otelMetrics.ts registers the provider stays a no-op forever.
let requestDuration: Histogram | undefined
let queryDuration: Histogram | undefined

export function recordRequestDuration(seconds: number, attributes: Record<string, string | number>) {
  requestDuration ??= metrics
    .getMeter('watchd')
    .createHistogram('http.server.request.duration', { unit: 's', description: 'Duration of inbound HTTP requests' })
  requestDuration.record(seconds, attributes)
}

export function recordQueryDuration(seconds: number, attributes: Record<string, string | number>) {
  queryDuration ??= metrics
    .getMeter('watchd-db')
    .createHistogram('db.client.operation.duration', { unit: 's', description: 'Duration of database operations' })
  queryDuration.record(seconds, attributes)
}

let plexListenerReconnects: Counter | undefined

export function recordPlexListenerReconnect() {
  plexListenerReconnects ??= metrics
    .getMeter('watchd')
    .createCounter('plex.listener.reconnects', { description: 'Reconnect attempts of the Plex websocket listener' })
  plexListenerReconnects.add(1)
}
