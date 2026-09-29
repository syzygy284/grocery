import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEntry,
  deleteItem,
  finishTrip,
  moveBetween,
  removeFromList,
  restoreToList,
  snooze,
  stepQty,
  toggleCart,
  updateItem,
} from './actions'
import { db, type Item } from './db'
import { parseEntry } from './format'

let clock = 1_000_000
function tick(ms = 1000) {
  clock += ms
  return clock
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  clock = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function byName(name: string): Promise<Item> {
  const found = (await db.items.toArray()).find((i) => i.name.toLowerCase() === name.toLowerCase())
  if (!found) throw new Error(`no item ${name}`)
  return found
}

// Adds an item via the real addEntry path, then applies raw field overrides.
async function seed(text: string, over: Partial<Item> = {}): Promise<Item> {
  await addEntry(text)
  const { name } = parseEntry(text)
  const created = await byName(name)
  if (Object.keys(over).length) await db.items.update(created.id, over)
  return byName(name)
}

describe('addEntry', () => {
  it('creates a new item from parsed text', async () => {
    await addEntry('6 lb chicken breast')
    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      name: 'Chicken breast',
      qty: 6,
      unit: 'lb',
      step: 1,
      usualQty: 6,
      status: 'list',
      sortOrder: 1,
      updatedAt: clock,
    })
    expect(items[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ignores empty input', async () => {
    await addEntry('   ')
    expect(await db.items.count()).toBe(0)
  })

  it('re-uses an existing item case-insensitively instead of re-creating it', async () => {
    const milk = await seed('milk', { status: 'off', usualQty: 2, sortOrder: 5 })
    tick()
    await addEntry('MILK')
    const items = await db.items.toArray()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: milk.id, name: 'Milk', status: 'list', qty: 2, sortOrder: 5, updatedAt: clock })
  })

  it('restores usualQty when an off item is re-added without a qty', async () => {
    await seed('eggs', { status: 'off', qty: 1, usualQty: 3 })
    await addEntry('eggs')
    expect(await byName('eggs')).toMatchObject({ status: 'list', qty: 3 })
  })

  it('uses an explicit qty/unit over the usual ones', async () => {
    await seed('salmon', { status: 'off', unit: 'lb', usualQty: 1 })
    await addEntry('1.5 lb salmon')
    expect(await byName('salmon')).toMatchObject({ status: 'list', qty: 1.5, unit: 'lb' })
  })

  it('keeps the unit when the new entry has no qty', async () => {
    await seed('salmon', { status: 'off', unit: 'lb', usualQty: 2 })
    await addEntry('Salmon')
    expect(await byName('salmon')).toMatchObject({ unit: 'lb', qty: 2 })
  })

  it('keeps cart status and qty when a cart item is re-added', async () => {
    await seed('bread', { status: 'cart', qty: 2, usualQty: 1 })
    await addEntry('bread')
    expect(await byName('bread')).toMatchObject({ status: 'cart', qty: 2 })
  })

  it('clears a snooze when re-added', async () => {
    await seed('rice', { status: 'off', snoozedUntil: clock + 1e9 })
    await addEntry('rice')
    expect((await byName('rice')).snoozedUntil).toBeUndefined()
  })

  it('does not re-use a soft-deleted item', async () => {
    const old = await seed('kale')
    await deleteItem(old.id)
    await addEntry('kale')
    const live = (await db.items.toArray()).filter((i) => !i.deleted)
    expect(live).toHaveLength(1)
    expect(live[0].id).not.toBe(old.id)
  })

  it('gives rapid concurrent adds distinct, increasing sortOrders', async () => {
    const names = ['apples', 'bananas', 'carrots', 'dates', 'eggs', 'figs']
    await Promise.all(names.map((n) => addEntry(n)))
    const items = await db.items.toArray()
    expect(items).toHaveLength(names.length)
    const orders = names.map((n) => items.find((i) => i.name.toLowerCase() === n)!.sortOrder)
    expect(new Set(orders).size).toBe(names.length)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('does not duplicate an item added twice concurrently', async () => {
    await Promise.all([addEntry('milk'), addEntry('Milk')])
    expect(await db.items.count()).toBe(1)
  })
})

describe('stepQty', () => {
  it('steps up and down', async () => {
    await stepQty(await seed('3 apples'), 1)
    expect((await byName('apples')).qty).toBe(4)
    await stepQty(await byName('apples'), -1)
    expect((await byName('apples')).qty).toBe(3)
  })

  it('never goes to zero or below', async () => {
    const it0 = await seed('apples')
    const before = it0.updatedAt
    tick()
    await stepQty(it0, -1)
    const after = await byName('apples')
    expect(after.qty).toBe(1)
    expect(after.updatedAt).toBe(before)
  })

  it('avoids float artifacts with 0.1 steps', async () => {
    await seed('salmon', { qty: 0.1, step: 0.1, unit: 'lb' })
    for (let i = 0; i < 2; i++) await stepQty(await byName('salmon'), 1)
    expect((await byName('salmon')).qty).toBe(0.3)
    for (let i = 0; i < 5; i++) await stepQty(await byName('salmon'), 1)
    expect((await byName('salmon')).qty).toBe(0.8)
    for (let i = 0; i < 10; i++) await stepQty(await byName('salmon'), -1)
    expect((await byName('salmon')).qty).toBe(0.1)
  })
})

describe('toggleCart', () => {
  it('moves list -> cart with checkedAt, and cart -> list clearing it', async () => {
    const a = await seed('apples')
    tick()
    await toggleCart(a)
    let now = await byName('apples')
    expect(now).toMatchObject({ status: 'cart', checkedAt: clock, updatedAt: clock })
    tick()
    await toggleCart(now)
    now = await byName('apples')
    expect(now.status).toBe('list')
    expect(now.checkedAt).toBeUndefined()
    expect(now.updatedAt).toBe(clock)
  })
})

describe('finishTrip', () => {
  it('logs a trip + purchases and moves cart items off', async () => {
    const chicken = await seed('2 lb chicken', { status: 'cart', checkedAt: clock, snoozedUntil: clock + 1e9 })
    const eggs = await seed('eggs', { status: 'cart', qty: 3, usualQty: 1 })
    const milk = await seed('milk') // still on the list
    const gone = await seed('kale', { status: 'cart', deleted: true })
    const t = tick()

    await finishTrip(4599, '  Kroger ')

    const trips = await db.trips.toArray()
    expect(trips).toHaveLength(1)
    expect(trips[0]).toMatchObject({ date: t, totalCents: 4599, store: 'Kroger', itemCount: 2, updatedAt: t })

    const purchases = await db.purchases.toArray()
    expect(purchases).toHaveLength(2)
    for (const p of purchases) expect(p).toMatchObject({ tripId: trips[0].id, boughtAt: t, updatedAt: t })
    expect(purchases.find((p) => p.itemId === chicken.id)).toMatchObject({ qty: 2, unit: 'lb' })
    expect(purchases.find((p) => p.itemId === eggs.id)).toMatchObject({ qty: 3, unit: '' })
    expect(purchases.some((p) => p.itemId === gone.id)).toBe(false)

    const c = await db.items.get(chicken.id)
    expect(c).toMatchObject({ status: 'off', lastBoughtAt: t, usualQty: 2, updatedAt: t })
    expect(c!.checkedAt).toBeUndefined()
    expect(c!.snoozedUntil).toBeUndefined()
    expect(await db.items.get(eggs.id)).toMatchObject({ status: 'off', usualQty: 3, lastBoughtAt: t })

    expect(await db.items.get(milk.id)).toEqual(milk)
    expect(await db.items.get(gone.id)).toMatchObject({ status: 'cart', deleted: true })
  })

  it('stores no store name when blank', async () => {
    await seed('apples', { status: 'cart' })
    await finishTrip(100, '   ')
    expect((await db.trips.toArray())[0].store).toBeUndefined()
  })
})

describe('moveBetween', () => {
  it('places an item halfway between two neighbours', async () => {
    const a = await seed('a')
    const b = await seed('b')
    const c = await seed('c')
    await moveBetween(c.id, a, b)
    expect((await byName('c')).sortOrder).toBe(1.5)
    const sorted = (await db.items.orderBy('sortOrder').toArray()).map((i) => i.name)
    expect(sorted).toEqual(['A', 'C', 'B'])
  })

  it('moves to the end / start with only one neighbour', async () => {
    const a = await seed('a')
    const b = await seed('b')
    await moveBetween(a.id, b, undefined)
    expect((await byName('a')).sortOrder).toBe(3)
    await moveBetween(a.id, undefined, b)
    expect((await byName('a')).sortOrder).toBe(1)
  })

  it('does nothing without neighbours', async () => {
    const a = await seed('a')
    tick()
    await moveBetween(a.id)
    expect(await byName('a')).toEqual(a)
  })

  it('keeps subdividing without collisions', async () => {
    const a = await seed('a')
    const b = await seed('b')
    const x = await seed('x')
    let right = b
    for (let i = 0; i < 20; i++) {
      await moveBetween(x.id, a, right)
      right = await byName('x')
      expect(right.sortOrder).toBeGreaterThan(a.sortOrder)
    }
  })
})

describe('deleteItem', () => {
  it('soft-deletes instead of removing the row', async () => {
    const a = await seed('apples')
    tick()
    await deleteItem(a.id)
    expect(await db.items.count()).toBe(1)
    expect(await db.items.get(a.id)).toMatchObject({ deleted: true, status: 'off', updatedAt: clock })
  })
})

describe('updatedAt', () => {
  it('is bumped by every item write', async () => {
    const a = await seed('apples')
    const writes: [string, () => Promise<unknown>][] = [
      ['stepQty', async () => stepQty(await byName('apples'), 1)],
      ['toggleCart', async () => toggleCart(await byName('apples'))],
      ['updateItem', () => updateItem(a.id, { unit: 'bag' })],
      ['removeFromList', () => removeFromList(a.id)],
      ['restoreToList', async () => restoreToList(await byName('apples'))],
      ['snooze', () => snooze(a.id, 1000)],
      ['addEntry (existing)', () => addEntry('apples')],
      ['moveBetween', () => moveBetween(a.id, undefined, a)],
      ['deleteItem', () => deleteItem(a.id)],
    ]
    for (const [label, write] of writes) {
      const t = tick()
      await write()
      expect((await db.items.get(a.id))!.updatedAt, label).toBe(t)
    }
  })
})
