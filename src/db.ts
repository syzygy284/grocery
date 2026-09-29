import Dexie, { type EntityTable } from 'dexie'

// Every record carries a UUID `id`, an `updatedAt` timestamp, and a soft
// `deleted` flag instead of being removed. Those three fields are what a
// future sync layer needs to merge changes between devices.

export type ItemStatus = 'list' | 'cart' | 'off'

export interface Item {
  id: string
  name: string
  qty: number
  unit: string // '' means a plain count
  step: number // how much +/- changes qty
  usualQty: number // qty restored when re-added to the list
  status: ItemStatus // list = need it, cart = checked off, off = not needed now
  sortOrder: number // position in store walking order (fractional ok)
  checkedAt?: number
  lastBoughtAt?: number
  snoozedUntil?: number // suggestion dismissed until this time
  updatedAt: number
  deleted?: boolean
}

export interface Trip {
  id: string
  date: number
  totalCents: number
  store?: string
  itemCount: number
  updatedAt: number
  deleted?: boolean
}

export interface Purchase {
  id: string
  itemId: string
  tripId: string
  qty: number
  unit: string
  boughtAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Setting {
  key: string
  value: unknown
  updatedAt: number
}

export const db = new Dexie('grocery') as Dexie & {
  items: EntityTable<Item, 'id'>
  trips: EntityTable<Trip, 'id'>
  purchases: EntityTable<Purchase, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  items: 'id, status, sortOrder, updatedAt',
  trips: 'id, date, updatedAt',
  purchases: 'id, itemId, tripId, boughtAt, updatedAt',
  settings: 'key, updatedAt',
})

// crypto.randomUUID only exists in secure contexts (HTTPS/localhost); the
// fallback keeps the app working when opened over plain http on the LAN.
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
