import type { Item, Purchase } from './db'

const DAY = 86_400_000

export interface Suggestion {
  item: Item
  intervalDays: number
  daysSince: number
}

// Day number of the *local* calendar date, so an evening trip doesn't count as
// the next (UTC) day. Date.UTC on local parts also sidesteps DST 23/25h days.
function localDay(t: number): number {
  const d = new Date(t)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
}

// Typical gap between purchases of an item, in ms. Uses the median of the
// most recent gaps so one odd week doesn't skew it. Needs 2+ distinct days.
export function purchaseInterval(boughtAt: number[]): number | undefined {
  const days = [...new Set(boughtAt.map(localDay))].sort((a, b) => a - b)
  if (days.length < 2) return undefined
  const gaps = days.slice(1).map((d, i) => d - days[i]).slice(-6).sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.max(1, median) * DAY
}

export function computeSuggestions(items: Item[], purchases: Purchase[], now = Date.now()): Suggestion[] {
  const byItem = new Map<string, number[]>()
  for (const p of purchases) {
    if (p.deleted) continue
    const list = byItem.get(p.itemId) ?? []
    list.push(p.boughtAt)
    byItem.set(p.itemId, list)
  }

  const out: Suggestion[] = []
  for (const item of items) {
    if (item.deleted || item.status !== 'off') continue
    if (item.snoozedUntil && item.snoozedUntil > now) continue
    const times = byItem.get(item.id)
    if (!times) continue
    const interval = purchaseInterval(times)
    if (!interval) continue
    const since = now - Math.max(...times)
    if (since >= interval * 0.9) {
      out.push({ item, intervalDays: Math.round(interval / DAY), daysSince: Math.floor(since / DAY) })
    }
  }
  return out.sort((a, b) => b.daysSince / b.intervalDays - a.daysSince / a.intervalDays)
}

export function snoozeFor(s: Suggestion): number {
  return Math.max(1, s.intervalDays) * DAY
}
