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
  leftPercent: number
  collapsed: Side | null
}

const KEY = 'whetstone.panes'
const MIN = 25
const MAX = 75
const STEP = 5
const DEFAULT: Layout = { leftPercent: 50, collapsed: null }

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10))

// A display preference of this browser, like the theme, so it lives in localStorage.
function loadLayout(): Layout {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return DEFAULT
    const { leftPercent, collapsed } = stored as Record<string, unknown>
    return {
      leftPercent:
        typeof leftPercent === 'number' && Number.isFinite(leftPercent)
          ? clamp(leftPercent)
          : DEFAULT.leftPercent,
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
  // Where in the divider it was grabbed, so it does not jump to the pointer.
  const [grab, setGrab] = useState<number | null>(null)
  const dragging = grab !== null
  // The control to focus once a toggle has replaced the one pressed.
  const focusNext = useRef<HTMLElement | null>(null)
  const controls = useRef(new Map<string, HTMLElement | null>())

  useEffect(() => {
    if (dragging) return
    try {
      localStorage.setItem(KEY, JSON.stringify(layout))
    } catch {
      // Without storage the layout holds until reload.
    }
  }, [layout, dragging])

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current.focus()
    focusNext.current = null
  })

  const setLeft = (percent: number) => setLayout((l) => ({ ...l, leftPercent: clamp(percent) }))
  const toggle = (side: Side, collapse: boolean) => {
    focusNext.current =
      controls.current.get(collapse ? `strip-${side}` : `collapse-${side}`) ?? null
    setLayout((l) => ({ ...l, collapsed: collapse ? side : null }))
  }

  const onKey = (event: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowLeft: layout.leftPercent - STEP,
      ArrowRight: layout.leftPercent + STEP,
      Home: MIN,
      End: MAX,
    }
    if (!(event.key in keys)) return
    event.preventDefault()
    setLeft(keys[event.key])
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setGrab(event.clientX - event.currentTarget.getBoundingClientRect().left)
  }
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect()
    if (grab === null || !rect || rect.width === 0) return
    setLeft(((event.clientX - grab - rect.left) / rect.width) * 100)
  }
  const stopDrag = () => setGrab(null)

  const both = layout.collapsed === null
  // Both panes stay mounted, so the editor keeps its undo history while hidden.
  const pane = (side: Side, { label, content }: Pane) => {
    const collapsed = layout.collapsed === side
    return (
      <>
        <button
          ref={(el) => void controls.current.set(`strip-${side}`, el)}
          type="button"
          className={`ws-strip ws-strip-${side}`}
          hidden={!collapsed}
          aria-expanded="false"
          aria-label={`Expand ${label}`}
          onClick={() => toggle(side, false)}
        >
          <Icon name={side === 'left' ? 'chevron-right' : 'chevron-left'} />
          <span>{label}</span>
        </button>
        <section className="ws-pane" aria-label={label} hidden={collapsed}>
          <header className="ws-pane-head">
            <span className="ws-pane-title">{label}</span>
            <button
              ref={(el) => void controls.current.set(`collapse-${side}`, el)}
              type="button"
              className="ws-icon-button"
              hidden={!both}
              aria-expanded="true"
              aria-label={`Collapse ${label}`}
              title={`Collapse ${label}`}
              onClick={() => toggle(side, true)}
            >
              <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} />
            </button>
          </header>
          <div className="ws-pane-body">{content}</div>
        </section>
      </>
    )
  }

  return (
    <div
      ref={box}
      className="ws-split"
      data-collapsed={layout.collapsed ?? undefined}
      data-dragging={dragging || undefined}
      style={{ '--ws-split': `${layout.leftPercent}%` } as CSSProperties}
    >
      {pane('left', left)}
      <div
        className="ws-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Math.round(layout.leftPercent)}
        hidden={!both}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
        onDoubleClick={() => setLeft(DEFAULT.leftPercent)}
      />
      {pane('right', right)}
    </div>
  )
}
