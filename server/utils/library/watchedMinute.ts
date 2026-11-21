export function watchedMinuteOf(watchedAt: Date): Date {
  const minute = new Date(watchedAt)
  minute.setUTCSeconds(0, 0)
  return minute
}
