import { parseFloppyCsv } from '~~/server/utils/import/floppy'
import { readTraktUpload } from '~~/server/utils/import/trakt'
import { NotAnExportError, UnsupportedBackupVersionError, type ParsedImport } from '~~/server/utils/import/types'
import { parseWatchdBackup } from '~~/server/utils/import/watchdBackup'
import { importPlays } from '~~/server/utils/import/writePlays'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'
import { BodyTooLargeError, readBodyWithin } from '~~/server/utils/import/readBodyWithin'

const sources = {
  floppy: {
    label: 'Floppy export',
    parse: (files: { filename: string, data: Uint8Array }[]) => parseFloppyCsv(new TextDecoder().decode(files[0]!.data))
  },
  trakt: {
    label: 'Trakt export',
    parse: readTraktUpload
  },
  watchd: {
    label: 'Watchd backup',
    parse: files => parseWatchdBackup(new TextDecoder().decode(files[0]!.data))
  }
} satisfies Record<string, { label: string, parse: (files: { filename: string, data: Uint8Array }[]) => ParsedImport }>

type Source = keyof typeof sources

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const tooLarge = () => createError({ statusCode: 413, statusMessage: 'That file is over 100 MB, which is larger than any export or backup.' })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  if (Number(getRequestHeader(event, 'content-length') ?? 0) > MAX_UPLOAD_BYTES) throw tooLarge()

  const source = getRouterParam(event, 'source')
  if (!source || !(source in sources)) throw createError({ statusCode: 400, statusMessage: 'Unknown import source' })
  const importer = sources[source as Source]

  try {
    event._requestBody = await readBodyWithin(getRequestWebStream(event), MAX_UPLOAD_BYTES)
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw tooLarge()
    throw error
  }
  const parts = await readMultipartFormData(event)
  const files = (parts ?? [])
    .filter(part => part.name === 'file' && part.filename)
    .map(part => ({ filename: part.filename!, data: new Uint8Array(part.data) }))
  if (!files.length) throw createError({ statusCode: 400, statusMessage: 'Choose a file to import' })

  let parsed: ParsedImport
  try {
    parsed = importer.parse(files)
  } catch (error) {
    if (error instanceof NotAnExportError) {
      throw createError({ statusCode: 400, statusMessage: `This doesn't look like a ${importer.label}.`, data: { detail: error.message } })
    }
    if (error instanceof UnsupportedBackupVersionError) {
      throw createError({ statusCode: 400, statusMessage: 'This backup is from a newer version of watchd.', data: { detail: error.message } })
    }
    throw error
  }

  try {
    return await importPlays(user.id, parsed, source as Source)
  } finally {
    await queueSearchReindex([user.id])
  }
})
