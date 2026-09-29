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

export async function stepQty(item: Item, dir: 1 | -1) {
  const next = round(item.qty + dir * item.step)
  if (next <= 0) return
  await db.items.update(item.id, { qty: next, updatedAt: Date.now() })
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

// Place an item between two neighbours using a fractional sortOrder, so
// items currently off the list keep their place in the walking order.
export async function moveBetween(id: string, before?: Item, after?: Item) {
  let order: number
  if (before && after) order = (before.sortOrder + after.sortOrder) / 2
  else if (before) order = before.sortOrder + 1
  else if (after) order = after.sortOrder - 1
  else return
  await updateItem(id, { sortOrder: order })
}

export async function snooze(id: string, ms: number) {
  await updateItem(id, { snoozedUntil: Date.now() + ms })
}

export async function finishTrip(totalCents: number, store: string) {
  await db.transaction('rw', db.items, db.trips, db.purchases, async () => {
    const cart = (await liveItems()).filter((i) => i.status === 'cart')
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
  await db.transaction('rw', db.trips, db.purchases, async () => {
    await db.trips.update(tripId, { deleted: true, updatedAt: now })
    await db.purchases.where('tripId').equals(tripId).modify({ deleted: true, updatedAt: now })
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
  await db.transaction('rw', db.items, db.trips, db.purchases, db.settings, async () => {
    await db.items.bulkPut(data.items)
    await db.trips.bulkPut(data.trips ?? [])
    await db.purchases.bulkPut(data.purchases ?? [])
    await db.settings.bulkPut(data.settings ?? [])
  })
}
