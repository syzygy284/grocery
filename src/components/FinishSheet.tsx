import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { finishTrip } from '../actions'
import { db } from '../db'
import { fmtDate } from '../format'
import { Sheet } from './Sheet'

export function FinishSheet({ cartCount, onClose }: { cartCount: number; onClose: () => void }) {
  const [total, setTotal] = useState('')
  const [store, setStore] = useState('')
  const [error, setError] = useState('')
  const stores = useLiveQuery(async () => {
    const trips = await db.trips.orderBy('date').reverse().toArray()
    return [...new Set(trips.filter((t) => !t.deleted && t.store).map((t) => t.store!))]
  }, [])

  async function save() {
    const n = Number(total.replace(/[$,\s]/g, ''))
    if (total.trim() === '' || !Number.isFinite(n) || n < 0) return setError('Enter the total you paid')
    await finishTrip(Math.round(n * 100), store)
    onClose()
  }

  return (
    <Sheet title="Finish trip" onClose={onClose}>
      <p className="muted">
        {fmtDate(Date.now())} · {cartCount} {cartCount === 1 ? 'item' : 'items'} checked
      </p>
      <label className="field">
        <span>Total spent</span>
        <div className="money-input">
          <span>$</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={total}
            onChange={(e) => (setTotal(e.target.value), setError(''))}
            autoFocus
          />
        </div>
      </label>
      <label className="field">
        <span>Store (optional)</span>
        <input list="stores" value={store} onChange={(e) => setStore(e.target.value)} />
        <datalist id="stores">
          {stores?.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      {error && <p className="error">{error}</p>}
      <p className="muted small">Unchecked items stay on your list.</p>
      <button className="primary" onClick={save}>
        Save trip
      </button>
    </Sheet>
  )
}
