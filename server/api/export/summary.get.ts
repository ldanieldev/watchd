import { backupCounts } from '~~/server/utils/backup/buildBackup'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return backupCounts(user.id)
})
