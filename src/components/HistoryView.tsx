import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { deleteTrip } from '../actions'
import { db, type Trip } from '../db'
import { fmtDate, fmtMoney, fmtQty } from '../format'

export function HistoryView({ onBack }: { onBack: () => void }) {
  const trips = useLiveQuery(async () => (await db.trips.orderBy('date').reverse().toArray()).filter((t) => !t.deleted), [])
  const [open, setOpen] = useState<string | null>(null)

  const months = new Map<string, Trip[]>()
  for (const t of trips ?? []) {
    const key = new Date(t.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    months.set(key, [...(months.get(key) ?? []), t])
  }

  return (
    <>
      <header className="top">
        <button className="icon" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <h1>Trips</h1>
      </header>
      {trips?.length === 0 && <p className="empty">No trips yet. Check items off and tap "Finish trip".</p>}
      {[...months].map(([month, list]) => (
        <section key={month}>
          <h3 className="section month">
            <span>{month}</span>
            <span>{fmtMoney(list.reduce((s, t) => s + t.totalCents, 0))}</span>
          </h3>
          <ul className="rows">
            {list.map((t) => (
              <li key={t.id} className="trip">
                <button className="trip-head" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <span>{fmtDate(t.date)}</span>
                  <span className="small muted">
                    {t.itemCount} items{t.store ? ` · ${t.store}` : ''}
                  </span>
                  <span className="trip-total">{fmtMoney(t.totalCents)}</span>
                </button>
                {open === t.id && <TripDetail trip={t} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function TripDetail({ trip }: { trip: Trip }) {
  const rows = useLiveQuery(async () => {
    const purchases = await db.purchases.where('tripId').equals(trip.id).toArray()
    const items = await db.items.bulkGet(purchases.map((p) => p.itemId))
    return purchases.map((p, i) => ({ p, name: items[i]?.name ?? '(deleted item)' }))
  }, [trip.id])

  return (
    <div className="trip-detail">
      {rows?.map(({ p, name }) => (
        <div key={p.id} className="small">
          {name} <span className="muted">{fmtQty(p.qty, p.unit)}</span>
        </div>
      ))}
      <button className="danger link" onClick={() => confirm('Delete this trip from history?') && deleteTrip(trip.id)}>
        Delete trip
      </button>
    </div>
  )
}
