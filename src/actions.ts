import type { Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, type Item } from './db'
import { parseEntry } from './format'

const round = (n: number) => Math.round(n * 100) / 100

async function liveItems(): Promise<Item[]> {
  return (await db.items.toArray()).filter((i) => !i.deleted)
}

// Adds from the text box. Re-uses an existing item with the same name so its
// walking order, unit, and purchase history carry over.
export async function addEntry(text: string) {
  const { name, qty, unit } = parseEntry(text)
  if (!name) return
  // Transaction so rapid adds are serialized and each gets a distinct sortOrder.
  await db.transaction('rw', db.items, () => addParsed(name, qty, unit))
}

async function addParsed(name: string, qty?: number, unit?: string) {
  const items = await liveItems()
  const existing = items.find((i) => i.name.toLowerCase() === name.toLowerCase())
  const now = Date.now()
  if (existing) {
    await db.items.update(existing.id, {
      status: existing.status === 'off' ? 'list' : existing.status,
      qty: qty ?? (existing.status === 'off' ? existing.usualQty : existing.qty),
      ...(unit !== undefined && { unit }),
      snoozedUntil: undefined,
      updatedAt: now,
    })
    return
  }
  const maxOrder = items.reduce((m, i) => Math.max(m, i.sortOrder), 0)
  await db.items.add({
    id: uid(),
    name: name[0].toUpperCase() + name.slice(1),
    qty: qty ?? 1,
    unit: unit ?? '',
    step: 1,
    usualQty: qty ?? 1,
    status: 'list',
    sortOrder: maxOrder + 1,
    updatedAt: now,
  })
}

// Reads the current qty inside the transaction so rapid taps don't overwrite
// each other with the same stale value.
export async function stepQty(item: Item, dir: 1 | -1) {
  await db.transaction('rw', db.items, async () => {
    const cur = await db.items.get(item.id)
    if (!cur) return
    const next = round(cur.qty + dir * cur.step)
    if (next <= 0) return
    await db.items.update(item.id, { qty: next, updatedAt: Date.now() })
  })
}

export async function toggleCart(item: Item) {
  const toCart = item.status === 'list'
  await db.items.update(item.id, {
    status: toCart ? 'cart' : 'list',
    checkedAt: toCart ? Date.now() : undefined,
    updatedAt: Date.now(),
  })
}

export async function restoreToList(item: Item) {
  await db.items.update(item.id, {
    status: 'list',
    qty: item.usualQty,
    snoozedUntil: undefined,
    updatedAt: Date.now(),
  })
}

export async function updateItem(id: string, changes: Partial<Item>) {
  await db.items.update(id, { ...changes, updatedAt: Date.now() })
}

export async function removeFromList(id: string) {
  await updateItem(id, { status: 'off', checkedAt: undefined })
}

export async function deleteItem(id: string) {
  await updateItem(id, { status: 'off', deleted: true })
}

// Place an item right after `before` (or right before `after`) using a
// fractional sortOrder. Gaps are measured against ALL items, including ones
// currently off the list, so the new value never ties with a hidden item.
export async function moveBetween(id: string, before?: Item, after?: Item) {
  if (!before && !after) return
  const all = (await liveItems()).filter((i) => i.id !== id).sort((a, b) => a.sortOrder - b.sortOrder)
  let lo: number | undefined
  let hi: number | undefined
  if (before) {
    lo = before.sortOrder
    hi = all.find((i) => i.sortOrder > lo!)?.sortOrder
  } else {
    hi = after!.sortOrder
    lo = all.findLast((i) => i.sortOrder < hi!)?.sortOrder
  }
  const order = lo !== undefined && hi !== undefined ? (lo + hi) / 2 : lo !== undefined ? lo + 1 : hi! - 1
  await updateItem(id, { sortOrder: order })
}

export async function snooze(id: string, ms: number) {
  await updateItem(id, { snoozedUntil: Date.now() + ms })
}

export async function finishTrip(totalCents: number, store: string) {
  await db.transaction('rw', db.items, db.trips, db.purchases, async () => {
    const cart = (await liveItems()).filter((i) => i.status === 'cart')
    // Guards against a double-tapped Save logging a second, empty trip.
    if (cart.length === 0) return
    const now = Date.now()
    const tripId = uid()
    await db.trips.add({
      id: tripId,
      date: now,
      totalCents,
      store: store.trim() || undefined,
      itemCount: cart.length,
      updatedAt: now,
    })
    await db.purchases.bulkAdd(
      cart.map((i) => ({ id: uid(), itemId: i.id, tripId, qty: i.qty, unit: i.unit, boughtAt: now, updatedAt: now })),
    )
    await db.items.bulkUpdate(
      cart.map((i) => ({
        key: i.id,
        changes: {
          status: 'off' as const,
          lastBoughtAt: now,
          usualQty: i.qty,
          checkedAt: undefined,
          snoozedUntil: undefined,
          updatedAt: now,
        },
      })),
    )
  })
}

export async function deleteTrip(tripId: string) {
  const now = Date.now()
  await db.transaction('rw', db.trips, db.purchases, db.items, async () => {
    await db.trips.update(tripId, { deleted: true, updatedAt: now })
    const removed = await db.purchases.where('tripId').equals(tripId).toArray()
    await db.purchases.where('tripId').equals(tripId).modify({ deleted: true, updatedAt: now })
    // Recompute lastBoughtAt from the purchases that remain.
    for (const itemId of new Set(removed.map((p) => p.itemId))) {
      const rest = (await db.purchases.where('itemId').equals(itemId).toArray()).filter((p) => !p.deleted)
      const last = rest.length ? Math.max(...rest.map((p) => p.boughtAt)) : undefined
      await db.items.update(itemId, { lastBoughtAt: last, updatedAt: now })
    }
  })
}

export function useSetting<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.get(key), [key])
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value, updatedAt: Date.now() })
}

export async function exportBackup(): Promise<string> {
  const [items, trips, purchases, settings] = await Promise.all([
    db.items.toArray(),
    db.trips.toArray(),
    db.purchases.toArray(),
    db.settings.toArray(),
  ])
  return JSON.stringify({ version: 1, exportedAt: Date.now(), items, trips, purchases, settings }, null, 1)
}

export async function importBackup(json: string) {
  const data = JSON.parse(json)
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('Not a grocery backup file')
  // Merge: a backup record only replaces a local one if it's newer, so
  // restoring an old backup can't undo more recent changes.
  await db.transaction('rw', db.items, db.trips, db.purchases, db.settings, async () => {
    await mergeNewer(db.items, data.items, 'id')
    await mergeNewer(db.trips, data.trips ?? [], 'id')
    await mergeNewer(db.purchases, data.purchases ?? [], 'id')
    await mergeNewer(db.settings, data.settings ?? [], 'key')
  })
}

async function mergeNewer<T extends { updatedAt: number }>(table: Table<T, string>, rows: T[], key: keyof T) {
  const valid = rows.filter((r) => r && typeof r.updatedAt === 'number' && typeof r[key] === 'string')
  const existing = await table.bulkGet(valid.map((r) => r[key] as string))
  await table.bulkPut(valid.filter((r, i) => !existing[i] || existing[i]!.updatedAt < r.updatedAt))
}
