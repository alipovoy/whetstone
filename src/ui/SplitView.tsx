import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Icon } from './icons'

type Side = 'left' | 'right'

interface Layout {
  // Width of the left pane, in percent.
  split: number
  collapsed: Side | null
}

const KEY = 'whetstone.panes'
const MIN = 25
const MAX = 75
const STEP = 5
const DEFAULT: Layout = { split: 50, collapsed: null }

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)))

// A display preference of this browser, like the theme, so it lives in localStorage.
function loadLayout(): Layout {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return DEFAULT
    const { split, collapsed } = stored as Record<string, unknown>
    return {
      split: typeof split === 'number' && Number.isFinite(split) ? clamp(split) : DEFAULT.split,
      collapsed: collapsed === 'left' || collapsed === 'right' ? collapsed : null,
    }
  } catch {
    return DEFAULT
  }
}

interface Pane {
  label: string
  content: ReactNode
}

interface Props {
  left: Pane
  right: Pane
}

export function SplitView({ left, right }: Props) {
  const [layout, setLayout] = useState(loadLayout)
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      // Without storage the layout holds until reload.
    }
  }, [layout])

  const setSplit = (split: number) => setLayout((l) => ({ ...l, split: clamp(split) }))
  const collapse = (collapsed: Side | null) => setLayout((l) => ({ ...l, collapsed }))

  const onKey = (event: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowLeft: layout.split - STEP,
      ArrowRight: layout.split + STEP,
      Home: MIN,
      End: MAX,
    }
    if (!(event.key in keys)) return
    event.preventDefault()
    setSplit(keys[event.key])
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect()
    if (!dragging || !rect || rect.width === 0) return
    setSplit(((event.clientX - rect.left) / rect.width) * 100)
  }

  const pane = (side: Side, { label, content }: Pane) =>
    layout.collapsed === side ? (
      <button
        type="button"
        className={`ws-strip ws-strip-${side}`}
        aria-expanded="false"
        aria-label={`Expand ${label}`}
        onClick={() => collapse(null)}
      >
        <Icon name={side === 'left' ? 'chevron-right' : 'chevron-left'} />
        <span>{label}</span>
      </button>
    ) : (
      <section className="ws-pane" aria-label={label}>
        <header className="ws-pane-head">
          <span className="ws-pane-title">{label}</span>
          {layout.collapsed === null && (
            <button
              type="button"
              className="ws-icon-button"
              aria-expanded="true"
              aria-label={`Collapse ${label}`}
              title={`Collapse ${label}`}
              onClick={() => collapse(side)}
            >
              <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} />
            </button>
          )}
        </header>
        <div className="ws-pane-body">{content}</div>
      </section>
    )

  const both = layout.collapsed === null
  return (
    <div
      ref={box}
      className="ws-split"
      data-collapsed={layout.collapsed ?? undefined}
      data-dragging={dragging || undefined}
      style={{ '--ws-split': `${layout.split}%` } as CSSProperties}
    >
      {pane('left', left)}
      {both && (
        <div
          className="ws-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={layout.split}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={startDrag}
          onPointerMove={drag}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onDoubleClick={() => setSplit(DEFAULT.split)}
        />
      )}
      {pane('right', right)}
    </div>
  )
}
