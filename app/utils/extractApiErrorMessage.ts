import { FetchError } from 'ofetch'

export function extractApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof FetchError)) return fallbackMessage

  return error.data?.statusMessage ?? error.statusMessage ?? fallbackMessage
}
