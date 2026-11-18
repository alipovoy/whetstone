import { THEME_LABEL } from './Layout'
import { Icon } from './icons'
import { Link } from './Link'
import type { ReportSection, Route } from './route'
import { THEME_CHOICES, setThemeChoice, useThemeChoice } from './theme'

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
    </section>
  )
}
