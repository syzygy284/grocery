import { describe, expect, it } from 'vitest'
import type { Item, Purchase } from './db'
import { computeSuggestions, purchaseInterval } from './suggest'

const DAY = 86_400_000
const HOUR = 3_600_000
// Noon UTC, so +/- a few hours stays on the same UTC day.
const NOW = Date.UTC(2026, 5, 30, 12)
const daysBefore = (d: number) => NOW - d * DAY

function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    qty: 1,
    unit: '',
    step: 1,
    usualQty: 1,
    status: 'off',
    sortOrder: 1,
    updatedAt: 0,
    ...over,
  }
}

let seq = 0
function bought(itemId: string, daysAgo: number[], over: Partial<Purchase> = {}): Purchase[] {
  return daysAgo.map((d) => ({
    id: `p${seq++}`,
    itemId,
    tripId: 't',
    qty: 1,
    unit: '',
    boughtAt: daysBefore(d),
    updatedAt: 0,
    ...over,
  }))
}

describe('purchaseInterval', () => {
  it('needs at least 2 distinct days', () => {
    expect(purchaseInterval([])).toBeUndefined()
    expect(purchaseInterval([NOW])).toBeUndefined()
  })

  it('dedupes purchases on the same day', () => {
    expect(purchaseInterval([NOW, NOW + HOUR, NOW - 2 * HOUR])).toBeUndefined()
    expect(purchaseInterval([daysBefore(7), daysBefore(7) + HOUR, NOW, NOW + HOUR])).toBe(7 * DAY)
  })

  it('is order independent', () => {
    expect(purchaseInterval([NOW, daysBefore(14), daysBefore(7)])).toBe(7 * DAY)
  })

  it('uses the median gap (odd count)', () => {
    // gaps: 3, 7, 30 -> median 7
    expect(purchaseInterval([daysBefore(40), daysBefore(10), daysBefore(3), NOW])).toBe(7 * DAY)
  })

  it('uses the median gap (even count)', () => {
    // gaps: 4, 10 -> median 7
    expect(purchaseInterval([daysBefore(14), daysBefore(4), NOW])).toBe(7 * DAY)
  })

  it('only considers the 6 most recent gaps', () => {
    // Old gaps of 100 days would dominate if included; the last 6 gaps are 7.
    const days = [700, 600, 500, 400, 42, 35, 28, 21, 14, 7, 0]
    expect(purchaseInterval(days.map(daysBefore))).toBe(7 * DAY)
  })

  // Regression: days used to be bucketed as UTC days. In America/New_York a
  // trip Monday 9pm (01:00 UTC Tue) and Tuesday 7pm (23:00 UTC Tue) must count
  // as two shopping days, not one.
  it('buckets purchases by local calendar day', () => {
    const mon9pm = new Date(2026, 5, 29, 21).getTime()
    const tue7pm = new Date(2026, 5, 30, 19).getTime()
    expect(purchaseInterval([mon9pm, tue7pm])).toBe(1 * DAY)
  })
})

describe('computeSuggestions', () => {
  it('suggests an item whose usual interval has (nearly) elapsed', () => {
    const milk = item('milk')
    const s = computeSuggestions([milk], bought('milk', [21, 14, 7]), NOW)
    expect(s).toEqual([{ item: milk, intervalDays: 7, daysSince: 7 }])
  })

  it('suggests at 90% of the interval but not before', () => {
    // interval 10 days; 9 days since -> due, 8 days since -> not due
    expect(computeSuggestions([item('a')], bought('a', [29, 19, 9]), NOW)).toHaveLength(1)
    expect(computeSuggestions([item('a')], bought('a', [28, 18, 8]), NOW)).toHaveLength(0)
  })

  it('skips items without enough history', () => {
    expect(computeSuggestions([item('a')], [], NOW)).toEqual([])
    expect(computeSuggestions([item('a')], bought('a', [30]), NOW)).toEqual([])
  })

  it('only suggests items that are off the list', () => {
    const p = [...bought('l', [21, 14, 7]), ...bought('c', [21, 14, 7])]
    const s = computeSuggestions([item('l', { status: 'list' }), item('c', { status: 'cart' })], p, NOW)
    expect(s).toEqual([])
  })

  it('skips snoozed items until the snooze expires', () => {
    const p = bought('a', [21, 14, 7])
    expect(computeSuggestions([item('a', { snoozedUntil: NOW + 1 })], p, NOW)).toEqual([])
    expect(computeSuggestions([item('a', { snoozedUntil: NOW - 1 })], p, NOW)).toHaveLength(1)
  })

  it('skips deleted items', () => {
    expect(computeSuggestions([item('a', { deleted: true })], bought('a', [21, 14, 7]), NOW)).toEqual([])
  })

  it('ignores deleted purchases', () => {
    // Without the deleted purchase there is only 1 day of history.
    const p = [...bought('a', [14]), ...bought('a', [7], { deleted: true })]
    expect(computeSuggestions([item('a')], p, NOW)).toEqual([])
    // A deleted recent purchase must not reset "days since".
    const p2 = [...bought('a', [21, 14, 7]), ...bought('a', [0], { deleted: true })]
    expect(computeSuggestions([item('a')], p2, NOW)).toHaveLength(1)
  })

  it('sorts by how overdue the item is, relative to its interval', () => {
    const p = [
      ...bought('weekly', [21, 14, 7]), // 7 since / 7 interval = 1.0
      ...bought('mid', [35, 25, 15]), // 15 / 10 = 1.5
      ...bought('late', [40, 30, 20]), // 20 / 10 = 2.0
    ]
    const s = computeSuggestions([item('weekly'), item('mid'), item('late')], p, NOW)
    expect(s.map((x) => x.item.id)).toEqual(['late', 'mid', 'weekly'])
  })
})
