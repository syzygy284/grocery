import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, History, Plus, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { addEntry, moveBetween, restoreToList, setSetting, snooze, useSetting } from '../actions'
import { db, type Item } from '../db'
import { daysAgo, fmtQty } from '../format'
import { computeSuggestions, snoozeFor } from '../suggest'
import { EditSheet } from './EditSheet'
import { FinishSheet } from './FinishSheet'
import { CartRow, SortableItemRow } from './ItemRow'

const WEEK = 7 * 86_400_000
const bySort = (a: Item, b: Item) => a.sortOrder - b.sortOrder

export function ListView({ onNav }: { onNav: (v: 'history' | 'settings') => void }) {
  const items = useLiveQuery(() => db.items.toArray(), [])
  const purchases = useLiveQuery(() => db.purchases.toArray(), [])
  const suggestionsOn = useSetting('suggestionsEnabled', true)
  const pausedUntil = useSetting('suggestionsPausedUntil', 0)

  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [showAllOff, setShowAllOff] = useState(false)
  const [showAllSugg, setShowAllSugg] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!items) return null

  const live = items.filter((i) => !i.deleted)
  const onList = live.filter((i) => i.status === 'list').sort(bySort)
  const inCart = live.filter((i) => i.status === 'cart').sort(bySort)
  const off = live
    .filter((i) => i.status === 'off')
    .sort((a, b) => (b.lastBoughtAt ?? 0) - (a.lastBoughtAt ?? 0) || b.updatedAt - a.updatedAt)

  const query = text.trim().toLowerCase()
  const matches = query ? off.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 5) : []

  const suggestions =
    suggestionsOn && pausedUntil < Date.now() && purchases ? computeSuggestions(live, purchases) : []
  const shownSugg = showAllSugg ? suggestions : suggestions.slice(0, 3)
  const shownOff = showAllOff ? off : off.slice(0, 8)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    // Clear first so typing the next item during the save isn't wiped.
    setText('')
    await addEntry(text)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const to = onList.findIndex((i) => i.id === over.id)
    // With the dragged item removed, its new neighbours are rest[to - 1] and rest[to].
    const rest = onList.filter((i) => i.id !== active.id)
    moveBetween(String(active.id), rest[to - 1], rest[to])
  }

  return (
    <>
      <header className="top">
        <h1>List</h1>
        <span className="count">{onList.length ? `${onList.length} to get` : ''}</span>
        <button className="icon" aria-label="Trip history" onClick={() => onNav('history')}>
          <History size={20} />
        </button>
        <button className="icon" aria-label="Settings" onClick={() => onNav('settings')}>
          <Settings size={20} />
        </button>
      </header>

      <form className="add" onSubmit={submit}>
        <Plus size={18} className="add-icon" />
        <input
          placeholder="Add item (e.g. 6 lb chicken breast)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
          autoCapitalize="sentences"
        />
      </form>
      {matches.length > 0 && (
        <ul className="matches">
          {matches.map((i) => (
            <li key={i.id}>
              <button onClick={() => (restoreToList(i), setText(''))}>
                {i.name} <span className="muted">{fmtQty(i.usualQty, i.unit)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <section className="suggest">
          <div className="suggest-head">
            <span>Probably running low</span>
            <button onClick={() => setSetting('suggestionsPausedUntil', Date.now() + WEEK)}>Pause 1 wk</button>
          </div>
          {shownSugg.map((s) => (
            <div className="suggest-row" key={s.item.id}>
              <div className="suggest-text">
                <span>{s.item.name}</span>
                <span className="small">
                  every ~{s.intervalDays}d · last {s.daysSince}d ago
                </span>
              </div>
              <button className="yes" aria-label={`Add ${s.item.name}`} onClick={() => restoreToList(s.item)}>
                <Check size={18} />
              </button>
              <button className="no" aria-label={`Not now: ${s.item.name}`} onClick={() => snooze(s.item.id, snoozeFor(s))}>
                <X size={18} />
              </button>
            </div>
          ))}
          {suggestions.length > 3 && (
            <button className="link" onClick={() => setShowAllSugg(!showAllSugg)}>
              {showAllSugg ? 'Show fewer' : `${suggestions.length - 3} more`}
            </button>
          )}
        </section>
      )}

      {onList.length === 0 && inCart.length === 0 && (
        <p className="empty">Nothing on the list. Add something above{off.length ? ' or tap an item below' : ''}.</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={onList.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="rows">
            {onList.map((i) => (
              <SortableItemRow key={i.id} item={i} onEdit={setEditing} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {inCart.length > 0 && (
        <section>
          <h3 className="section">In cart · {inCart.length}</h3>
          <ul className="rows">
            {inCart.map((i) => (
              <CartRow key={i.id} item={i} />
            ))}
          </ul>
        </section>
      )}

      {off.length > 0 && (
        <section>
          <h3 className="section">Not on list · tap to add back</h3>
          <ul className="rows">
            {shownOff.map((i) => (
              <li className="row off" key={i.id}>
                <button className="name" onClick={() => restoreToList(i)}>
                  {i.name}
                  <span className="small muted">
                    {fmtQty(i.usualQty, i.unit)}
                    {i.lastBoughtAt ? ` · ${daysAgo(i.lastBoughtAt)}` : ''}
                  </span>
                </button>
                <button className="icon" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}>
                  ···
                </button>
                <button className="icon" aria-label={`Add ${i.name}`} onClick={() => restoreToList(i)}>
                  <Plus size={18} />
                </button>
              </li>
            ))}
          </ul>
          {off.length > 8 && (
            <button className="link" onClick={() => setShowAllOff(!showAllOff)}>
              {showAllOff ? 'Show fewer' : `Show all ${off.length}`}
            </button>
          )}
        </section>
      )}

      <div className="bottom-space" />
      {inCart.length > 0 && (
        <div className="finish-bar">
          <button className="primary" onClick={() => setFinishing(true)}>
            Finish trip · {inCart.length} in cart
          </button>
        </div>
      )}

      {editing && <EditSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
      {finishing && <FinishSheet cartCount={inCart.length} onClose={() => setFinishing(false)} />}
    </>
  )
}
