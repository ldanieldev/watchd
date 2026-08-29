import { createConsola, LogLevels, type LogObject, type LogType } from 'consola'

const SENSITIVE_KEY_PATTERN = /^(pass|pwd|token|secret|auth|cookie|session|email|phone|ssn|card|cvv|api[-_]?key)/i

const RESERVED_FIELD_KEYS = new Set(['time', 'level', 'scope', 'msg', 'release'])

// Alloy labels only lines matching trace|debug|info|warn|error|fatal, so consola's other types must collapse onto one.
const SEVERITY_BY_LEVEL = ['error', 'warn', 'info', 'info', 'debug', 'trace']

function toSeverityName(logObj: LogObject) {
  return logObj.type === 'fatal' ? 'fatal' : SEVERITY_BY_LEVEL[logObj.level] ?? 'info'
}

function resolveLogLevel() {
  const fallback = import.meta.dev ? LogLevels.debug : LogLevels.warn
  const configured = process.env.CONSOLA_LOG_LEVEL
  if (!configured) return fallback

  const namedLevel = LogLevels[configured.toLowerCase() as LogType]
  if (namedLevel !== undefined) return namedLevel

  const numericLevel = Number(configured)
  return Number.isFinite(numericLevel) ? numericLevel : fallback
}

function redactSensitiveValues(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  // message/stack are non-enumerable, so Object.entries would yield {}
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (Array.isArray(value)) return value.slice(0, 20).map(entry => redactSensitiveValues(entry, depth + 1))

  const redacted: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactSensitiveValues(nested, depth + 1)
  }
  return redacted
}

function mergeStructuredFields(args: unknown[]) {
  const merged: Record<string, unknown> = {}
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue
    for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
      if (!RESERVED_FIELD_KEYS.has(key)) merged[key] = value
    }
  }
  return merged
}

export function toLogRecord(logObj: LogObject) {
  const [message, ...structuredArgs] = logObj.args
  return {
    time: logObj.date.toISOString(),
    level: toSeverityName(logObj),
    scope: logObj.tag || undefined,
    msg: typeof message === 'string' ? message : '[non-string]',
    ...(redactSensitiveValues(mergeStructuredFields(structuredArgs)) as Record<string, unknown>)
  }
}

function createStdoutReporter() {
  // Bound up front because consola's wrapStd() swaps in a write that calls back into this logger, recursing forever.
  const writeLine = process.stdout.write.bind(process.stdout)
  const release = process.env.GIT_SHA ?? 'dev'

  return {
    log: (logObj: LogObject) => {
      writeLine(JSON.stringify({ ...toLogRecord(logObj), release }) + '\n')
    }
  }
}

export const logger = createConsola(
  import.meta.server
    ? {
        level: resolveLogLevel(),
        ...(import.meta.dev ? {} : { reporters: [createStdoutReporter()] })
      }
    : {}
)
