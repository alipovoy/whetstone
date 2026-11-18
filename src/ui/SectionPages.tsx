import { THEME_LABEL } from './Layout'
import { Icon } from './icons'
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
