import { metrics } from '@opentelemetry/api'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { HostMetrics } from '@opentelemetry/host-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

// Initialised in-process because Bun supports neither --import nor --require; instruments live in server/utils/metrics.ts.
export default defineNitroPlugin((nitroApp) => {
  if (process.env.ENABLE_OPENTELEMETRY !== 'true') return

  const provider = new MeterProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'watchd-server'
    }),
    readers: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })]
  })
  metrics.setGlobalMeterProvider(provider)
  new HostMetrics({ meterProvider: provider }).start()

  nitroApp.hooks.hookOnce('close', () => provider.shutdown())
})
