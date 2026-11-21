import { parseFloppyCsv } from '~~/server/utils/import/floppy'
import { readTraktUpload } from '~~/server/utils/import/trakt'
import { NotAnExportError, type ParsedImport } from '~~/server/utils/import/types'
import { importPlays } from '~~/server/utils/import/writePlays'

const sources = {
  floppy: {
    label: 'Floppy',
    parse: (files: { filename: string, data: Uint8Array }[]) => parseFloppyCsv(new TextDecoder().decode(files[0]!.data))
  },
  trakt: {
    label: 'Trakt',
    parse: readTraktUpload
  }
} satisfies Record<string, { label: string, parse: (files: { filename: string, data: Uint8Array }[]) => ParsedImport }>

type Source = keyof typeof sources

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  if (Number(getRequestHeader(event, 'content-length') ?? 0) > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'That file is over 100 MB, which is larger than any Floppy or Trakt export.' })
  }

  const source = getRouterParam(event, 'source')
  if (!source || !(source in sources)) throw createError({ statusCode: 400, statusMessage: 'Unknown import source' })
  const importer = sources[source as Source]

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
      throw createError({ statusCode: 400, statusMessage: `This doesn't look like a ${importer.label} export.`, data: { detail: error.message } })
    }
    throw error
  }

  return importPlays(user.id, parsed, source as Source)
})
