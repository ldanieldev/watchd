import type { Episode, LibraryData, Title, WatchEvent } from './types'
import { catalog } from './catalog'
import { isSpecial } from './derive'
import { addDays, toIsoDate } from './dates'

interface AiringSeason {
  episodes: number
  nextNumber: number
  nextInDays: number
}

interface EpisodicScenario {
  seasons: number[]
  airing?: AiringSeason
  specials?: number
  watched: number
  unwatchedRanges?: { season: number, from: number, to: number }[]
  lastWatchedDaysAgo?: number
  heldStatus?: 'paused' | 'dropped'
  episodesPerDay?: number
}

interface MovieScenario {
  runtimeMinutes: number
  watchedDaysAgo?: number[]
  minutesWatched?: number
  releaseInDays?: number
}

const SEASON_GAP_DAYS = 180
const EVENING_WEIGHTED_HOURS = [19, 20, 21, 21, 22, 22, 23, 0, 1, 13, 15, 17]
const BINGE_START_HOUR = 14

const episodic: Record<string, EpisodicScenario> = {
  'tulsa-king': { seasons: [9, 10, 10], airing: { episodes: 10, nextNumber: 9, nextInDays: 1 }, specials: 1, watched: 37, unwatchedRanges: [{ season: 3, from: 7, to: 10 }], lastWatchedDaysAgo: 4, episodesPerDay: 2 },
  'reacher': { seasons: [8, 8], airing: { episodes: 8, nextNumber: 8, nextInDays: 4 }, watched: 21, lastWatchedDaysAgo: 6 },
  'landman': { seasons: [10], airing: { episodes: 10, nextNumber: 3, nextInDays: 1 }, watched: 12, lastWatchedDaysAgo: 2 },
  'arcane': { seasons: [9, 9], watched: 18, lastWatchedDaysAgo: 40 },
  'the-mandalorian': { seasons: [8, 8, 8], watched: 19, lastWatchedDaysAgo: 120, heldStatus: 'paused' },
  'motherland-fort-salem': { seasons: [10, 10, 10], watched: 30, lastWatchedDaysAgo: 96 },
  'severance': { seasons: [9, 10], watched: 0 },
  'the-bear': { seasons: [8, 10, 10, 10], watched: 22, lastWatchedDaysAgo: 200, heldStatus: 'dropped' },
  'shogun': { seasons: [10], watched: 10, lastWatchedDaysAgo: 300 },
  'the-last-of-us': { seasons: [9, 7], watched: 16, lastWatchedDaysAgo: 160 },
  'slow-horses': { seasons: [6, 6, 6, 6], watched: 24, lastWatchedDaysAgo: 400 },
  'andor': { seasons: [12, 12], watched: 24, lastWatchedDaysAgo: 210 },
  'fallout': { seasons: [8], airing: { episodes: 8, nextNumber: 1, nextInDays: 27 }, watched: 8, lastWatchedDaysAgo: 220 },
  'house-of-the-dragon': { seasons: [10, 8], watched: 13, lastWatchedDaysAgo: 70 },
  'the-boys': { seasons: [8, 8, 8, 8], watched: 0 },
  'silo': { seasons: [10, 10], airing: { episodes: 10, nextNumber: 2, nextInDays: 3 }, watched: 21, lastWatchedDaysAgo: 5 },
  'foundation': { seasons: [10, 10, 10], watched: 26, lastWatchedDaysAgo: 25 },
  'ted-lasso': { seasons: [10, 12, 12], watched: 0 },
  'stranger-things': { seasons: [8, 9, 8, 9], airing: { episodes: 8, nextNumber: 1, nextInDays: 7 }, watched: 34, lastWatchedDaysAgo: 365 },
  'wednesday': { seasons: [8, 8], watched: 16, lastWatchedDaysAgo: 100 },
  'frieren-beyond-journey-s-end': { seasons: [], airing: { episodes: 38, nextNumber: 35, nextInDays: 7 }, specials: 26, watched: 34, lastWatchedDaysAgo: 1 },
  'saga-of-tanya-the-evil': { seasons: [12], airing: { episodes: 12, nextNumber: 10, nextInDays: 6 }, watched: 20, lastWatchedDaysAgo: 5, episodesPerDay: 3 },
  'reincarnated-as-a-sword': { seasons: [12], airing: { episodes: 12, nextNumber: 8, nextInDays: 7 }, watched: 16, lastWatchedDaysAgo: 9 },
  'black-clover': { seasons: [170], airing: { episodes: 12, nextNumber: 8, nextInDays: 2 }, watched: 177, lastWatchedDaysAgo: 3, episodesPerDay: 3 },
  'a-wild-last-boss-appeared': { seasons: [12], watched: 6, lastWatchedDaysAgo: 8 },
  'my-gift-lvl-9999-unlimited-gacha': { seasons: [12], watched: 5, lastWatchedDaysAgo: 8 },
  'that-time-i-got-reincarnated-as-a-slime': { seasons: [24, 24, 24], watched: 68, lastWatchedDaysAgo: 36, episodesPerDay: 3 },
  'one-piece': { seasons: [], airing: { episodes: 1120, nextNumber: 1101, nextInDays: 3 }, watched: 1095, lastWatchedDaysAgo: 30, episodesPerDay: 4 },
  'mushoku-tensei-jobless-reincarnation': { seasons: [23, 24], watched: 47, lastWatchedDaysAgo: 60 },
  'from-old-country-bumpkin-to-master-swordsman': { seasons: [12], watched: 12, lastWatchedDaysAgo: 55 },
  'farming-life-in-another-world': { seasons: [12], watched: 12, lastWatchedDaysAgo: 124 },
  'solo-leveling': { seasons: [12, 13], watched: 25, lastWatchedDaysAgo: 80 },
  'dan-da-dan': { seasons: [12, 12], airing: { episodes: 12, nextNumber: 1, nextInDays: 15 }, watched: 24, lastWatchedDaysAgo: 45 },
  'jujutsu-kaisen': { seasons: [24, 23], airing: { episodes: 12, nextNumber: 5, nextInDays: 5 }, watched: 0 },
  'spy-x-family': { seasons: [25, 12, 13], watched: 37, lastWatchedDaysAgo: 150, heldStatus: 'paused' },
  'chainsaw-man': { seasons: [12], watched: 4, lastWatchedDaysAgo: 500, heldStatus: 'dropped' },
  'vinland-saga': { seasons: [24, 24], watched: 0 },
  'delicious-in-dungeon': { seasons: [24], watched: 24, lastWatchedDaysAgo: 20 },
  'kaiju-no-8': { seasons: [12, 11], watched: 15, lastWatchedDaysAgo: 14 },
  'cyberpunk-edgerunners': { seasons: [10], watched: 5, lastWatchedDaysAgo: 12 }
}

const movies: Record<string, MovieScenario> = {
  'transporter-2': { runtimeMinutes: 87, watchedDaysAgo: [5] },
  'the-lord-of-the-rings-the-two-towers': { runtimeMinutes: 179, watchedDaysAgo: [15], minutesWatched: 95 },
  'spider-man-brand-new-day': { runtimeMinutes: 135, watchedDaysAgo: [44], minutesWatched: 40 },
  'ford-v-ferrari': { runtimeMinutes: 152, watchedDaysAgo: [95] },
  'the-devil-wears-prada-2': { runtimeMinutes: 119, watchedDaysAgo: [95] },
  'mortal-kombat-ii': { runtimeMinutes: 110, watchedDaysAgo: [131] },
  'the-wrecking-crew': { runtimeMinutes: 124, watchedDaysAgo: [136] },
  'glass-onion-a-knives-out-mystery': { runtimeMinutes: 139, watchedDaysAgo: [137, 700] },
  'wake-up-dead-man-a-knives-out-mystery': { runtimeMinutes: 144, watchedDaysAgo: [138] },
  'blade-runner': { runtimeMinutes: 118 },
  'blade-runner-2049': { runtimeMinutes: 164, watchedDaysAgo: [139, 900] },
  'ex-machina': { runtimeMinutes: 108, watchedDaysAgo: [139] },
  'dune-part-two': { runtimeMinutes: 166, watchedDaysAgo: [250] },
  'oppenheimer': { runtimeMinutes: 180, watchedDaysAgo: [320] },
  'wicked-for-good': { runtimeMinutes: 137, releaseInDays: -8 },
  'zootopia-2': { runtimeMinutes: 108, releaseInDays: 7 },
  'mad-max-fury-road': { runtimeMinutes: 120, watchedDaysAgo: [600] },
  'interstellar': { runtimeMinutes: 169, watchedDaysAgo: [800, 1200] },
  'everything-everywhere-all-at-once': { runtimeMinutes: 139 },
  'sinners': { runtimeMinutes: 137, watchedDaysAgo: [12] },
  'the-batman': { runtimeMinutes: 176, watchedDaysAgo: [3], minutesWatched: 60 },
  'knives-out': { runtimeMinutes: 131 },
  'dune': { runtimeMinutes: 155 },
  'dune-part-three': { runtimeMinutes: 150 }
}

function seedOf(text: string): number {
  let hash = 0
  for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash
}

function clockTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

function watchTimestamp(today: Date, daysAgo: number, seed: number): string {
  return `${toIsoDate(addDays(today, -daysAgo))}T${clockTime(EVENING_WEIGHTED_HOURS[seed % EVENING_WEIGHTED_HOURS.length]!, seed % 60)}`
}

function bingeTimestamp(today: Date, daysAgo: number, positionInDay: number, seed: number): string {
  return `${toIsoDate(addDays(today, -daysAgo))}T${clockTime(BINGE_START_HOUR + (seed % 3) + positionInDay, seed % 60)}`
}

function buildEpisodes(titleId: string, scenario: EpisodicScenario, today: Date): Episode[] {
  const episodes: Episode[] = []
  let cursor = scenario.airing
    ? addDays(today, scenario.airing.nextInDays - 7 * scenario.airing.nextNumber)
    : addDays(today, -((scenario.lastWatchedDaysAgo ?? 30) + 14))

  if (scenario.airing) {
    const airingSeason = scenario.seasons.length + 1
    for (let number = 1; number <= scenario.airing.episodes; number++) {
      episodes.push({ id: `${titleId}-${airingSeason}-${number}`, titleId, season: airingSeason, number, airDate: toIsoDate(addDays(cursor, 7 * number)) })
    }
    cursor = addDays(cursor, -SEASON_GAP_DAYS)
  }

  for (let seasonIndex = scenario.seasons.length - 1; seasonIndex >= 0; seasonIndex--) {
    const count = scenario.seasons[seasonIndex]!
    for (let number = count; number >= 1; number--) {
      episodes.unshift({ id: `${titleId}-${seasonIndex + 1}-${number}`, titleId, season: seasonIndex + 1, number, airDate: toIsoDate(cursor) })
      cursor = addDays(cursor, -7)
    }
    cursor = addDays(cursor, -SEASON_GAP_DAYS)
  }
  for (let number = (scenario.specials ?? 0); number >= 1; number--) {
    episodes.unshift({ id: `${titleId}-0-${number}`, titleId, season: 0, number, airDate: toIsoDate(cursor) })
    cursor = addDays(cursor, -7)
  }
  return episodes
}

function isUnwatchedByScenario(episode: Episode, scenario: EpisodicScenario): boolean {
  return (scenario.unwatchedRanges ?? []).some(range => range.season === episode.season && episode.number >= range.from && episode.number <= range.to)
}

export function buildFixtures(today: Date): LibraryData {
  const titles: Title[] = []
  const episodes: Episode[] = []
  const watches: WatchEvent[] = []

  for (const entry of catalog) {
    if (entry.type === 'movie') {
      const scenario = movies[entry.id] ?? { runtimeMinutes: 120 }
      const firstAired = scenario.releaseInDays === undefined ? entry.firstAired : toIsoDate(addDays(today, scenario.releaseInDays))
      titles.push({ ...entry, firstAired, runtimeMinutes: scenario.runtimeMinutes })
      scenario.watchedDaysAgo?.forEach((daysAgo, index) => watches.push({
        titleId: entry.id,
        watchedAt: watchTimestamp(today, daysAgo, seedOf(`${entry.id}-${index}`)),
        minutesWatched: index === 0 ? scenario.minutesWatched : undefined
      }))
      continue
    }

    const scenario = episodic[entry.id] ?? { seasons: [12], watched: 0 }
    titles.push({ ...entry, heldStatus: scenario.heldStatus })
    const titleEpisodes = buildEpisodes(entry.id, scenario, today)
    episodes.push(...titleEpisodes)
    const watchedSpan = titleEpisodes.filter(episode => !isSpecial(episode)).slice(0, scenario.watched)
    const watchedEpisodes = watchedSpan.filter(episode => !isUnwatchedByScenario(episode, scenario))
    const perDay = scenario.episodesPerDay ?? 1
    watchedEpisodes.forEach((episode, index) => {
      const fromLatest = watchedEpisodes.length - 1 - index
      const daysAgo = (scenario.lastWatchedDaysAgo ?? 0) + Math.floor(fromLatest / perDay)
      const seed = seedOf(`${entry.id}-${daysAgo}`)
      watches.push({
        titleId: entry.id,
        episodeId: episode.id,
        watchedAt: perDay > 1 ? bingeTimestamp(today, daysAgo, perDay - 1 - (fromLatest % perDay), seed) : watchTimestamp(today, daysAgo, seed)
      })
    })
  }

  return { titles, episodes, watches }
}
