import { describe, it, expect } from 'vitest'
import { traceContextMixin } from '../../server/utils/logger'

const span = (traceId: string, spanId: string) => ({ spanContext: () => ({ traceId, spanId }) })

describe('traceContextMixin', () => {
  it('returns an empty object when there is no active span', () => {
    expect(traceContextMixin(undefined)).toEqual({})
  })

  it('returns trace_id and span_id from the active span', () => {
    expect(traceContextMixin(span('a'.repeat(32), 'b'.repeat(16)))).toEqual({
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16)
    })
  })

  it('returns an empty object for an invalid (all-zero) span context, e.g. when the SDK is disabled', () => {
    expect(traceContextMixin(span('0'.repeat(32), '0'.repeat(16)))).toEqual({})
  })
})
