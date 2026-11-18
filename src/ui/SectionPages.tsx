import { THEME_LABEL } from './Layout'
import { Icon } from './icons'
import { Link } from './Link'
import type { ReportSection, Route } from './route'
import {
  SCHEMES,
  THEME_CHOICES,
  setScheme,
  setThemeChoice,
  useDarkMode,
  useScheme,
  useThemeChoice,
  type Scheme,
} from './theme'

const SCHEME: Record<Scheme, { label: string; text: string }> = {
  slate: { label: 'Slate', text: 'Steel blue on stone grey' },
  mint: { label: 'Mint', text: 'Cool green on a green tint' },
  sunset: { label: 'Sunset', text: 'Burnt orange on a warm tint' },
  amber: { label: 'Amber', text: 'Bright orange on plain grey' },
  emerald: { label: 'Emerald', text: 'Vivid green on navy' },
  rainbow: { label: 'Rainbow', text: 'A colour for each section' },
}

const RAINBOW_SECTIONS = ['coding', 'quizzes', 'reports', 'settings']

const REPORT: Record<ReportSection, { title: string; text: string; action: string; to: Route }> = {
  coding: {
    title: 'Coding problems',
    text: 'A status per concept and the history of your graded attempts will show here.',
    action: 'Solve a problem',
    to: { page: 'problems' },
  },
  quizzes: {
    title: 'Quizzes',
    text: 'Every quiz you took, its score and the concepts you missed most will show here.',
    action: 'Build a quiz',
    to: { page: 'quizzes' },
  },
}

export function ReportPage({ section }: { section: ReportSection }) {
  const report = REPORT[section]
  return (
    <section aria-labelledby="report-title" className="d-grid gap-3">
      <h1 id="report-title" className="h3">
        {report.title}
      </h1>
      <div className="ws-panel ws-empty">
        <h2 className="h5">Reports come with progress tracking</h2>
        <p className="text-body-secondary">{report.text}</p>
        <Link className="btn btn-primary" to={report.to}>
          {report.action}
        </Link>
      </div>
    </section>
  )
}

export function AppearancePage() {
  const choice = useThemeChoice()
  const scheme = useScheme()
  const dark = useDarkMode()
  return (
    <section aria-labelledby="appearance-title" className="d-grid gap-3">
      <h1 id="appearance-title" className="h3">
        Appearance
      </h1>
      <div className="ws-panel p-4">
        <fieldset>
          <legend className="h5">Theme</legend>
          <div className="ws-choices">
            {THEME_CHOICES.map((c) => (
              <label key={c} className="ws-choice">
                <input
                  type="radio"
                  name="theme"
                  value={c}
                  checked={choice === c}
                  onChange={() => setThemeChoice(c)}
                />
                <Icon name={c} />
                <span>
                  {THEME_LABEL[c]}
                  {c === 'system' && <small>Follows your device</small>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="ws-panel p-4">
        <fieldset>
          <legend className="h5">Colour scheme</legend>
          <div className="ws-choices">
            {SCHEMES.map((s) => (
              <label key={s} className="ws-choice">
                <input
                  type="radio"
                  name="scheme"
                  value={s}
                  checked={scheme === s}
                  onChange={() => setScheme(s)}
                />
                <span
                  className="ws-swatch"
                  data-ws-scheme={s}
                  data-bs-theme={dark ? 'dark' : 'light'}
                  aria-hidden="true"
                >
                  {s === 'rainbow' ? (
                    RAINBOW_SECTIONS.map((section) => <i key={section} data-ws-section={section} />)
                  ) : (
                    <i />
                  )}
                </span>
                <span>
                  {SCHEME[s].label}
                  <small>{SCHEME[s].text}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  )
}
