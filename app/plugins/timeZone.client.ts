import { msUntilNextMidnight } from '~~/shared/utils/library/dates'
import { browserTimeZone, todayIn } from '~~/shared/utils/zonedTime'

export default defineNuxtPlugin(() => {
  const timeZone = useLibraryTimeZone()
  const cookie = useTimeZoneCookie()
  const today = useLibraryToday()

  function tick() {
    today.value = todayIn(timeZone.value)
    // +1s past midnight so timer drift never re-fires while it's still the previous day.
    setTimeout(tick, msUntilNextMidnight(new Date()) + 1000)
  }

  // After hydration, so a server render in another zone (first visit, no cookie yet) hydrates cleanly before switching.
  onNuxtReady(() => {
    const zone = browserTimeZone()
    if (cookie.value !== zone) cookie.value = zone
    if (timeZone.value !== zone) timeZone.value = zone
    tick()
  })
})
