import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('~~/server/utils/logger', () => ({ logger: log }))
let registrationMode: string | undefined = 'open'
vi.stubGlobal('useRuntimeConfig', () => ({ registration: registrationMode }))

const harness = createServerHandlerHarness()
const { registrationOpen } = await import('~~/server/utils/registration')

type Handler = (e: unknown) => Promise<unknown>
const registrationGet = (await import('~~/server/api/auth/registration.get')).default as Handler

beforeEach(() => {
  harness.reset()
  log.warn.mockClear()
  registrationMode = 'open'
})

describe('registrationOpen', () => {
  it('is open in closed mode while there are no users', () => {
    expect(registrationOpen(0, 'closed')).toBe(true)
  })

  it('is closed in closed mode once a user exists', () => {
    expect(registrationOpen(1, 'closed')).toBe(false)
  })

  it('is open in open mode regardless of users', () => {
    expect(registrationOpen(5, 'open')).toBe(true)
  })

  it('treats an unknown mode as closed and warns once', async () => {
    vi.resetModules()
    const fresh = (await import('~~/server/utils/registration')).registrationOpen
    expect(fresh(1, 'bogus')).toBe(false)
    expect(fresh(1, 'bogus')).toBe(false)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('reads the mode from runtime config by default', () => {
    registrationMode = 'closed'
    expect(registrationOpen(1)).toBe(false)
    registrationMode = 'open'
    expect(registrationOpen(1)).toBe(true)
  })
})

describe('GET /api/auth/registration', () => {
  it('reports closed when closed with an existing user, without a session', async () => {
    registrationMode = 'closed'
    harness.givenDb({ select: [[{ total: 1 }]] })
    await expect(registrationGet({})).resolves.toEqual({ open: false })
  })

  it('reports open when closed with no users', async () => {
    registrationMode = 'closed'
    harness.givenDb({ select: [[{ total: 0 }]] })
    await expect(registrationGet({})).resolves.toEqual({ open: true })
  })
})
