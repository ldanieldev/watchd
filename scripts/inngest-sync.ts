import { createHmac } from 'node:crypto'

// Inngest's own --sdk-url sync runs only at its start, so a deploy that leaves it running would not register new jobs.
export function syncSignature(signingKey: string, timestamp: string): string {
  const key = signingKey.replace(/^signkey-\w+-/, '')
  return `t=${timestamp}&s=${createHmac('sha256', key).update(timestamp).digest('hex')}`
}

export async function syncInngest(origin: string, signingKey: string): Promise<string> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const res = await fetch(new URL('/api/inngest', origin), {
    method: 'PUT',
    headers: { 'X-Inngest-Signature': syncSignature(signingKey, timestamp) }
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Inngest sync failed: ${res.status} ${body}`)
  return body
}

if (import.meta.main) {
  const { INNGEST_SERVE_ORIGIN: origin, INNGEST_SIGNING_KEY: signingKey } = process.env
  if (!origin || !signingKey) throw new Error('INNGEST_SERVE_ORIGIN and INNGEST_SIGNING_KEY are required')
  console.log(await syncInngest(origin, signingKey))
}
