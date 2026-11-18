import type { ReactNode } from 'react'
import { Icon, Logo, type IconName } from './icons'
import { Link } from './Link'
import type { Route, Section } from './route'
import { THEME_CHOICES, setThemeChoice, useThemeChoice, type ThemeChoice } from './theme'

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

interface SideMenuPageProps {
  label: string
  items: { label: string; to: Route; current: boolean }[]
  held?: boolean
  children: ReactNode
}

export function SideMenuPage({ label, items, held = false, children }: SideMenuPageProps) {
  return (
    <div className="ws-with-side">
      <nav className="ws-side" aria-label={label}>
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
      <div className="ws-side-content">{children}</div>
    </div>
  )
}
