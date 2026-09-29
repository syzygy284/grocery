export const UNIT_PRESETS = ['', 'lb', 'oz', 'bag', 'box', 'can', 'ctn', 'pack', 'bottle', 'jar', 'tub', 'dozen']

const PLURALS: Record<string, string> = {
  bag: 'bags',
  box: 'boxes',
  can: 'cans',
  pack: 'packs',
  bottle: 'bottles',
  jar: 'jars',
  tub: 'tubs',
  loaf: 'loaves',
  bunch: 'bunches',
  head: 'heads',
  carton: 'cartons',
}

const SINGULARS: Record<string, string> = Object.fromEntries(
  Object.entries(PLURALS).map(([s, p]) => [p, s]),
)
SINGULARS.lbs = 'lb'
SINGULARS.ctns = 'ctn'

export function fmtNum(n: number): string {
  return String(Number(n.toFixed(2)))
}

export function fmtQty(qty: number, unit: string): string {
  const n = fmtNum(qty)
  if (!unit) return n
  const u = qty !== 1 && PLURALS[unit] ? PLURALS[unit] : unit
  return `${n} ${u}`
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const fmtMoney = (cents: number) => money.format(cents / 100)

const DAY = 86_400_000

export function daysAgo(ts: number, now = Date.now()): string {
  // Round, not floor: DST days are 23 or 25 hours long.
  const d = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// "6 lb chicken breast" -> { qty: 6, unit: 'lb', name: 'chicken breast' }
// "12 bananas"          -> { qty: 12, unit: '', name: 'bananas' }
export function parseEntry(text: string): { name: string; qty?: number; unit?: string } {
  const t = text.trim().replace(/\s+/g, ' ')
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/)
  if (!m) return { name: t }
  const qty = Number(m[1])
  const word = m[2]?.toLowerCase()
  if (word) {
    const unit = SINGULARS[word] ?? word
    if (UNIT_PRESETS.includes(unit) || PLURALS[unit]) return { qty, unit, name: m[3] }
    return { qty, unit: '', name: `${m[2]} ${m[3]}` }
  }
  return { qty, unit: '', name: m[3] }
}
