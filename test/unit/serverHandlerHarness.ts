import { vi } from 'vitest'

interface SessionUser { id: number, email?: string, name?: string }
interface SessionState { user?: SessionUser }

export interface QueuedResults {
  select?: unknown[][]
  insert?: unknown[]
  insertError?: unknown
  update?: unknown[]
  delete?: unknown[]
}

export interface MultipartPart { name?: string, filename?: string, data: Uint8Array }

export interface HandlerEvent {
  body?: unknown
  params?: Record<string, string>
  multipart?: MultipartPart[]
  headers?: Record<string, string>
  stream?: ReadableStream<Uint8Array>
  query?: Record<string, string>
  cookies?: Record<string, string>
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
  let deleteReturn: unknown[] = []
  const deleteWhere = vi.fn(() => thenableChain(['returning'], () => Promise.resolve(deleteReturn)))
  const setUserSession = vi.fn(() => Promise.resolve())
  const clearUserSession = vi.fn(() => Promise.resolve())

  const insertChain = thenableChain(
    ['returning', 'onConflictDoNothing', 'onConflictDoUpdate'],
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
  vi.stubGlobal('requireUserSession', () => session.user
    ? Promise.resolve(session)
    : Promise.reject(Object.assign(new Error('Unauthorized'), { statusCode: 401 })))
  vi.stubGlobal('readMultipartFormData', (event: HandlerEvent) => Promise.resolve(event.multipart))
  vi.stubGlobal('getQuery', (event: HandlerEvent) => event.query ?? {})
  vi.stubGlobal('getCookie', (event: HandlerEvent, name: string) => event.cookies?.[name])
  vi.stubGlobal('getRequestWebStream', (event: HandlerEvent) => event.stream)
  vi.stubGlobal('getRequestHeader', (event: HandlerEvent, name: string) => event.headers?.[name.toLowerCase()])
  vi.stubGlobal('clearUserSession', clearUserSession)

  return {
    mocks: { selectColumns, returningColumns, insertValues, updateSet, deleteWhere, setUserSession, clearUserSession },

    givenDb({ select = [], insert = [], insertError: failure = null, update = [], delete: deleted = [] }: QueuedResults) {
      deleteReturn = deleted
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
      deleteReturn = []
      session = {}
    }
  }
}

export const event = (options: HandlerEvent = {}) => options
