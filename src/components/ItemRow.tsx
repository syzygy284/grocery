import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Minus, Plus } from 'lucide-react'
import { stepQty, toggleCart } from '../actions'
import type { Item } from '../db'
import { fmtQty } from '../format'

export function SortableItemRow({ item, onEdit }: { item: Item; onEdit: (item: Item) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  return (
    <li
      ref={setNodeRef}
      className={`row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="check" aria-label={`Check off ${item.name}`} onClick={() => toggleCart(item)} />
      <button className="name" onClick={() => onEdit(item)}>
        {item.name}
      </button>
      <div className="stepper">
        <button aria-label="Less" onClick={() => stepQty(item, -1)}>
          <Minus size={16} />
        </button>
        <button className="qty" aria-label="Edit amount" onClick={() => onEdit(item)}>
          {fmtQty(item.qty, item.unit)}
        </button>
        <button aria-label="More" onClick={() => stepQty(item, 1)}>
          <Plus size={16} />
        </button>
      </div>
      <button ref={setActivatorNodeRef} className="grip" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
    </li>
  )
}

export function CartRow({ item }: { item: Item }) {
  return (
    <li className="row in-cart">
      <button className="check checked" aria-label={`Uncheck ${item.name}`} onClick={() => toggleCart(item)}>
        <Check size={14} strokeWidth={3} />
      </button>
      <button className="name" onClick={() => toggleCart(item)}>
        {item.name}
      </button>
      <span className="qty-static">{fmtQty(item.qty, item.unit)}</span>
    </li>
  )
}
