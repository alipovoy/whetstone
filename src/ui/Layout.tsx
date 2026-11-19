import { useId, type ReactNode } from 'react'
import { Icon, Logo, type IconName } from './icons'
import { Link } from './Link'
import type { Route, Section } from './route'
import {
  THEME_CHOICES,
  setSideMenu,
  setThemeChoice,
  useSideMenu,
  useThemeChoice,
  type ThemeChoice,
} from './theme'

const MENU: { section: Section; label: string; icon: IconName; to: Route }[] = [
  { section: 'coding', label: 'Coding problems', icon: 'code', to: { page: 'problems' } },
  { section: 'quizzes', label: 'Quizzes', icon: 'quiz', to: { page: 'quizzes' } },
  {
    section: 'reports',
    label: 'Reports',
    icon: 'reports',
    to: { page: 'reports', section: 'coding' },
  },
  { section: 'settings', label: 'Settings', icon: 'settings', to: { page: 'appearance' } },
]

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

interface TopBarProps {
  section: Section
  // While Python checks code, leaving the page is blocked.
  held: boolean
}

export function TopBar({ section, held }: TopBarProps) {
  return (
    <header className="ws-bar">
      <Link className="ws-brand" to={{ page: 'home' }} held={held}>
        <Logo />
        Whetstone
      </Link>
      <nav className="ws-menu" aria-label="Main">
        {MENU.map((item) => (
          <Link
            key={item.section}
            to={item.to}
            held={held}
            data-ws-section={item.section}
            aria-current={item.section === section ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
      <ThemeSwitch />
    </header>
  )
}

function ThemeSwitch() {
  const choice = useThemeChoice()
  return (
    <div className="ws-seg ws-theme" role="group" aria-label="Theme">
      {THEME_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={choice === c}
          aria-label={`${THEME_LABEL[c]} theme`}
          title={`${THEME_LABEL[c]} theme`}
          onClick={() => setThemeChoice(c)}
        >
          <Icon name={c} />
        </button>
      ))}
    </div>
  )
}

interface SubMenuPageProps {
  label: string
  items: { label: string; to: Route; current: boolean }[]
  placement: 'side' | 'top'
  held?: boolean
  children: ReactNode
}

export function SubMenuPage({ label, items, placement, held = false, children }: SubMenuPageProps) {
  const id = useId()
  const side = useSideMenu()
  const nav = (
    <nav id={id} className="ws-sub-menu" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          held={held}
          aria-current={item.current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
  const open = side === 'open'
  return (
    <div
      className="ws-sub"
      data-placement={placement}
      data-side={placement === 'side' ? side : undefined}
    >
      {placement === 'side' ? (
        <div className="ws-sub-side">
          {nav}
          <div className="ws-sub-edge">
            <button
              type="button"
              aria-controls={id}
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} the ${label} menu`}
              title={`${open ? 'Hide' : 'Show'} the menu`}
              onClick={() => setSideMenu(open ? 'closed' : 'open')}
            >
              <Icon name={open ? 'chevron-left' : 'chevron-right'} />
            </button>
          </div>
        </div>
      ) : (
        nav
      )}
      <div className="ws-sub-content">{children}</div>
    </div>
  )
}
