const PG_UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  // Drizzle wraps the driver error, so the Postgres code and constraint sit on error.cause.
  const driverError = ((error as { cause?: unknown } | null)?.cause ?? error) as { code?: string, constraint?: string } | null
  return driverError?.code === PG_UNIQUE_VIOLATION && (constraint === undefined || driverError.constraint === constraint)
}
