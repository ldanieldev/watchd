export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body is over ${maxBytes} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

function joinChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

/** Reads a request body into memory, cancelling the stream as soon as it passes `maxBytes`. */
export async function readBodyWithin(stream: ReadableStream<Uint8Array> | undefined, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!stream) return new Uint8Array(0)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return joinChunks(chunks, received)
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
}
