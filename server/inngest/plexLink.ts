import { inngest } from '../utils/inngest/client'
import { PLEX_LINK_EVENT } from '../utils/inngest/plexLinkEvent'
import type { PlexLinkEventData } from '../utils/inngest/plexLinkEvent'
import { runPlexLinkSteps } from '../utils/plex/link'
import type { PlexLinkStepRunner } from '../utils/plex/link'

const PLEX_LINK_RETRIES = 3

export const plexLink = inngest.createFunction(
  {
    id: 'plex-link',
    triggers: [{ event: PLEX_LINK_EVENT }],
    concurrency: { key: 'event.data.userId', limit: 1 },
    retries: PLEX_LINK_RETRIES
  },
  async ({ event, step, attempt }) => {
    const { userId, rerun } = event.data as PlexLinkEventData
    // step.run types its result as Jsonify<Result>; every link step returns plain JSON, so the cast only drops that wrapper.
    const stepRunner: PlexLinkStepRunner = { run: (id, run) => step.run(id, run) as Promise<never> }
    return runPlexLinkSteps({ userId, rerun, isFinalAttempt: attempt >= PLEX_LINK_RETRIES, step: stepRunner })
  }
)
