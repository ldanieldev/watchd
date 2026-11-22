import { backupFilename, buildBackup } from '~~/server/utils/backup/buildBackup'
import { requireExportUserId } from '~~/server/utils/accessTokens/exportAuth'

export default defineEventHandler(async (event) => {
  const userId = await requireExportUserId(event)
  const now = new Date()
  const backup = await buildBackup(userId, now)
  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${backupFilename(now)}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return backup
})
