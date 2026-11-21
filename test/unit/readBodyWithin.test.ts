import { describe, expect, it } from 'vitest'
import { BodyTooLargeError, readBodyWithin } from '~~/server/utils/import/readBodyWithin'

function streamOf(chunks: Uint8Array[]) {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift()
      if (next) controller.enqueue(next)
      else controller.close()
    },
    cancel() {
      cancelled = true
    }
  })
  return { stream, wasCancelled: () => cancelled }
}

describe('readBodyWithin', () => {
  it('joins the chunks of a body at or under the limit', async () => {
    const { stream } = streamOf([new Uint8Array([1, 2]), new Uint8Array([3, 4])])

    await expect(readBodyWithin(stream, 4)).resolves.toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('stops reading and cancels the stream once the body passes the limit', async () => {
    const { stream, wasCancelled } = streamOf([new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)])

    await expect(readBodyWithin(stream, 4)).rejects.toBeInstanceOf(BodyTooLargeError)
    expect(wasCancelled()).toBe(true)
  })

  it('returns an empty buffer when there is no body', async () => {
    await expect(readBodyWithin(undefined, 4)).resolves.toEqual(new Uint8Array(0))
  })
})
