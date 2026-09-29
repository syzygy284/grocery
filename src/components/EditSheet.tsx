import { useState } from 'react'
import { deleteItem, removeFromList, updateItem } from '../actions'
import type { Item } from '../db'
import { UNIT_PRESETS } from '../format'
import { Sheet } from './Sheet'

export function EditSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name)
  const [qty, setQty] = useState(String(item.qty))
  const [unit, setUnit] = useState(item.unit)
  const [step, setStep] = useState(String(item.step))
  const [error, setError] = useState('')

  async function save() {
    const q = Number(qty)
    const s = Number(step)
    if (!name.trim()) return setError('Enter a name')
    if (!(q > 0)) return setError('Amount must be more than 0')
    if (!(s > 0)) return setError('Step must be more than 0')
    await updateItem(item.id, { name: name.trim(), qty: q, unit: unit.trim(), step: s })
    onClose()
  }

  const custom = !UNIT_PRESETS.includes(unit)

  return (
    <Sheet title="Edit item" onClose={onClose}>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => (setName(e.target.value), setError(''))} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Amount</span>
          <input inputMode="decimal" value={qty} onChange={(e) => (setQty(e.target.value), setError(''))} autoFocus />
        </label>
        <label className="field">
          <span>+/− step</span>
          <input inputMode="decimal" value={step} onChange={(e) => (setStep(e.target.value), setError(''))} />
        </label>
      </div>
      <div className="field">
        <span>Unit</span>
        <div className="chips">
          {UNIT_PRESETS.map((u) => (
            <button key={u || 'count'} className={`chip${unit === u ? ' on' : ''}`} onClick={() => setUnit(u)}>
              {u || 'count'}
            </button>
          ))}
        </div>
        <input
          className={custom ? 'custom-on' : ''}
          placeholder="Custom unit (e.g. scoop, loaf)"
          value={custom ? unit : ''}
          onChange={(e) => setUnit(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={save}>
        Done
      </button>
      <div className="sheet-actions">
        {item.status !== 'off' && (
          <button onClick={() => removeFromList(item.id).then(onClose)}>Remove from list</button>
        )}
        <button
          className="danger"
          onClick={() => confirm(`Delete "${item.name}" and forget it?`) && deleteItem(item.id).then(onClose)}
        >
          Delete item
        </button>
      </div>
    </Sheet>
  )
}
