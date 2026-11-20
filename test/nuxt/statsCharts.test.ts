import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import StatsBarChart from '~/components/stats/BarChart.vue'
import StatsSplitBar from '~/components/stats/SplitBar.vue'
import StatsCalendarHeatmap from '~/components/stats/CalendarHeatmap.vue'
import StatsRhythmGrid from '~/components/stats/RhythmGrid.vue'
import StatsRankedList from '~/components/stats/RankedList.vue'

const EMPTY_TEXT = 'Nothing here for this range'

function insideApp<Props extends object>(component: object, props: Props) {
  return defineComponent({ render: () => h(UApp, null, { default: () => h(component, props) }) })
}

describe('BarChart', () => {
  it('draws one bar per entry with the tallest at full height', async () => {
    const wrapper = await mountSuspended(insideApp(StatsBarChart, { bars: [{ label: 'Mon', value: 30, tooltip: '30 min' }, { label: 'Tue', value: 60, tooltip: '1 h' }] }))
    const bars = wrapper.findAll('[data-bar]')
    expect(bars).toHaveLength(2)
    expect(bars[1]!.attributes('style')).toContain('height: 100%')
  })

  it('shows the empty line when every value is zero', async () => {
    const wrapper = await mountSuspended(insideApp(StatsBarChart, { bars: [{ label: 'Mon', value: 0, tooltip: '0 min' }] }))
    expect(wrapper.text()).toContain(EMPTY_TEXT)
  })
})

describe('SplitBar', () => {
  it('draws a labelled segment per non-zero value sized by share', async () => {
    const wrapper = await mountSuspended(StatsSplitBar, {
      props: {
        segments: [
          { label: 'TV', value: 3, colorClass: 'bg-cyan-500', display: '3 h' },
          { label: 'Anime', value: 0, colorClass: 'bg-pink-500', display: '0 h' },
          { label: 'Movie', value: 1, colorClass: 'bg-amber-500', display: '1 h' }
        ]
      }
    })
    const segments = wrapper.findAll('[data-segment]')
    expect(segments).toHaveLength(2)
    expect(segments[0]!.attributes('style')).toContain('flex-grow: 3')
    expect(wrapper.text()).toContain('TV')
    expect(wrapper.text()).toContain('75%')
  })

  it('shows the empty line with no values', async () => {
    const wrapper = await mountSuspended(StatsSplitBar, { props: { segments: [] } })
    expect(wrapper.text()).toContain(EMPTY_TEXT)
  })
})

describe('CalendarHeatmap', () => {
  it('draws a cell per day', async () => {
    const days = Array.from({ length: 30 }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, '0')}`, minutes: index % 3 ? 45 : 0 }))
    const wrapper = await mountSuspended(StatsCalendarHeatmap, { props: { days } })
    expect(wrapper.findAll('[data-day]')).toHaveLength(30)
  })

  it('shows the empty line with no minutes', async () => {
    const wrapper = await mountSuspended(StatsCalendarHeatmap, { props: { days: [{ date: '2026-11-01', minutes: 0 }] } })
    expect(wrapper.text()).toContain(EMPTY_TEXT)
  })
})

describe('RhythmGrid', () => {
  it('draws a dot only where there is activity', async () => {
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    cells[0]![21] = 90
    cells[5]![14] = 30
    const wrapper = await mountSuspended(StatsRhythmGrid, { props: { cells } })
    expect(wrapper.findAll('[data-dot]')).toHaveLength(2)
  })
})

describe('RankedList', () => {
  it('links rows that have a destination', async () => {
    const wrapper = await mountSuspended(StatsRankedList, {
      props: { rows: [{ label: 'Denis Villeneuve', value: 3, display: '3 titles', to: '/people/137427' }, { label: 'Legendary', value: 2, display: '2 titles' }] }
    })
    expect(wrapper.find('a[href="/people/137427"]').text()).toContain('Denis Villeneuve')
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('shows the empty line with no rows', async () => {
    const wrapper = await mountSuspended(StatsRankedList, { props: { rows: [] } })
    expect(wrapper.text()).toContain(EMPTY_TEXT)
  })
})
