import { vi } from 'vitest'

interface SessionUser { id: number, email?: string, name?: string }
interface SessionState { user?: SessionUser }

export interface QueuedResults {
  select?: unknown[][]
  insert?: unknown[]
  insertError?: unknown
  update?: unknown[]
}

export interface HandlerEvent {
  body?: unknown
  params?: Record<string, string>
}

type Settle<T> = <R1 = T, R2 = never>(
  onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
  onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
) => PromiseLike<R1 | R2>

// drizzle query builders are thenable at every step, so awaiting mid-chain has to work
function thenableChain<T>(
  methods: string[],
  settle: () => Promise<T>,
  spies: Record<string, (arg: unknown) => void> = {}
) {
  const chain: Record<string, unknown> = {
    then: ((onFulfilled, onRejected) => settle().then(onFulfilled, onRejected)) as Settle<T>
  }
  for (const method of methods) {
    chain[method] = (arg?: unknown) => {
      spies[method]?.(arg)
      return chain
    }
  }
  return chain
}

export function createServerHandlerHarness() {
  let selectQueue: unknown[][] = []
  let insertReturn: unknown[] = []
  let insertError: unknown = null
  let updateReturn: unknown[] = []
  let session: SessionState = {}

  const selectColumns = vi.fn()
  const returningColumns = vi.fn()
  const insertValues = vi.fn(() => insertChain)
  const updateSet = vi.fn(() => updateChain)
  const deleteWhere = vi.fn(() => Promise.resolve())
  const setUserSession = vi.fn(() => Promise.resolve())
  const clearUserSession = vi.fn(() => Promise.resolve())

  const insertChain = thenableChain(
    ['returning'],
    () => insertError ? Promise.reject(insertError) : Promise.resolve(insertReturn),
    { returning: returningColumns })
  const updateChain = thenableChain(
    ['where', 'returning'],
    () => Promise.resolve(updateReturn),
    { returning: returningColumns })

  const db = {
    select: (columns?: unknown) => {
      selectColumns(columns)
      const rows = selectQueue.shift() ?? []
      return thenableChain(['from', 'where', 'orderBy', 'limit'], () => Promise.resolve(rows))
    },
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere })
  }

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', (event: HandlerEvent) => Promise.resolve(event.body))
  vi.stubGlobal('getRouterParam', (event: HandlerEvent, name: string) => event.params?.[name])
  vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage: string }) =>
    Object.assign(new Error(opts.statusMessage), opts))
  vi.stubGlobal('withQuerySpan', (_name: string, fn: () => Promise<unknown>) => fn())
  vi.stubGlobal('db', db)
  vi.stubGlobal('hashPassword', (plain: string) => Promise.resolve(`scrypt:${plain}`))
  vi.stubGlobal('verifyPassword', (hash: string, plain: string) => Promise.resolve(hash === `scrypt:${plain}`))
  vi.stubGlobal('setUserSession', setUserSession)
  vi.stubGlobal('getUserSession', () => Promise.resolve(session))
  vi.stubGlobal('clearUserSession', clearUserSession)

  return {
    mocks: { selectColumns, returningColumns, insertValues, updateSet, deleteWhere, setUserSession, clearUserSession },

    givenDb({ select = [], insert = [], insertError: failure = null, update = [] }: QueuedResults) {
      selectQueue = [...select]
      insertReturn = insert
      insertError = failure
      updateReturn = update
    },

    setSession(next: SessionState) {
      session = next
    },

    reset() {
      vi.clearAllMocks()
      selectQueue = []
      insertReturn = []
      insertError = null
      updateReturn = []
      session = {}
    }
  }
}

export const event = (options: HandlerEvent = {}) => options
