import { serve } from 'inngest/nuxt'
import { enrichTitle } from '~~/server/inngest/enrichTitle'
import { plexLink } from '~~/server/inngest/plexLink'
import { plexPurgeUnmarked } from '~~/server/inngest/plexPurgeUnmarked'
import { plexPush } from '~~/server/inngest/plexPush'
import { plexScan, plexScanSchedule } from '~~/server/inngest/plexScan'
import { refreshLibrary } from '~~/server/inngest/refreshLibrary'
import { inngest } from '~~/server/utils/inngest/client'

export default defineEventHandler(
  serve({
    client: inngest,
    // Otherwise an unsigned PUT re-registers the app at whatever URL its Host header names (cloud mode only).
    enableUnauthedSync: false,
    functions: [enrichTitle, plexLink, plexPurgeUnmarked, plexPush, plexScan, plexScanSchedule, refreshLibrary]
  })
)
