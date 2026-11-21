import { describe, expect, it } from 'vitest'
import { absoluteEpisodeRemaps } from '~~/server/utils/tmdb/absoluteEpisodes'

const range = (season: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, offset) => ({ season, number: from + offset }))
const onePieceTail = [...range(0, 1, 3), ...range(20, 878, 891), ...range(21, 892, 1088), ...range(22, 1089, 1155), ...range(23, 1156, 1180)]

describe('absoluteEpisodeRemaps', () => {
  it('maps a per-season number onto a season TMDB numbers absolutely', () => {
    expect(absoluteEpisodeRemaps(onePieceTail, [{ season: 21, number: 96 }])).toEqual([{ from: { season: 21, number: 96 }, to: { season: 21, number: 987 } }])
  })

  it('follows the absolute number into the next season when the seasons split differently', () => {
    expect(absoluteEpisodeRemaps(onePieceTail, [{ season: 22, number: 68 }])).toEqual([{ from: { season: 22, number: 68 }, to: { season: 23, number: 1156 } }])
  })

  it('leaves plays that already match a TMDB episode alone', () => {
    expect(absoluteEpisodeRemaps(onePieceTail, [{ season: 21, number: 900 }])).toEqual([])
  })

  it('leaves seasons that TMDB numbers from 1, and seasons TMDB does not list', () => {
    const show = [...range(1, 1, 13), ...range(2, 1, 13)]
    expect(absoluteEpisodeRemaps(show, [{ season: 2, number: 20 }, { season: 0, number: 1 }, { season: 7, number: 1 }])).toEqual([])
  })

  it('leaves a play whose absolute number TMDB does not have', () => {
    expect(absoluteEpisodeRemaps(onePieceTail, [{ season: 23, number: 90 }])).toEqual([])
  })
})
