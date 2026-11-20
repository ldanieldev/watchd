import { Inngest } from 'inngest'
import { logger } from '../logger'
import { RunLogging } from './runLogging'

export const inngest = new Inngest({
  id: 'watchd',
  logger: logger.child({ component: 'inngest' }),
  middleware: [RunLogging]
})
