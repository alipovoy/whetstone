import { useEffect, useRef, useState } from 'react'

// Hash addresses need no server rewrite on GitHub Pages.
export type Route =
  | { page: 'home' }
  | { page: 'problems' }
  | { page: 'solve'; topic: string; problem: string }
  | { page: 'quizzes' }
  | { page: 'quiz'; id: string }
  | { page: 'reports'; section: ReportSection }
  | { page: 'appearance' }
  | { page: 'topics' }
  | { page: 'topic'; id: string }

export type ReportSection = 'coding' | 'quizzes'
export type Section = 'home' | 'coding' | 'quizzes' | 'reports' | 'settings'

export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })
  const [first, second, third, ...rest] = parts
  if (rest.length > 0) return { page: 'home' }
  switch (first) {
    case 'coding':
      if (second && third) return { page: 'solve', topic: second, problem: third }
      return second ? { page: 'home' } : { page: 'problems' }
    case 'quizzes':
      if (third) return { page: 'home' }
      return second ? { page: 'quiz', id: second } : { page: 'quizzes' }
    case 'reports':
      if (third) return { page: 'home' }
      return second === 'quizzes'
        ? { page: 'reports', section: 'quizzes' }
        : { page: 'reports', section: 'coding' }
    case 'settings':
      if (second === 'topics') return third ? { page: 'topic', id: third } : { page: 'topics' }
      return third ? { page: 'home' } : { page: 'appearance' }
    default:
      return { page: 'home' }
  }
}

export function href(route: Route): string {
  const path = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/')
  switch (route.page) {
    case 'home':
      return '#/'
    case 'problems':
      return path('coding')
    case 'solve':
      return path('coding', route.topic, route.problem)
    case 'quizzes':
      return path('quizzes')
    case 'quiz':
      return path('quizzes', route.id)
    case 'reports':
      return path('reports', route.section)
    case 'appearance':
      return path('settings', 'appearance')
    case 'topics':
      return path('settings', 'topics')
    case 'topic':
      return path('settings', 'topics', route.id)
  }
}

export function sectionOf(route: Route): Section {
  switch (route.page) {
    case 'home':
      return 'home'
    case 'problems':
    case 'solve':
      return 'coding'
    case 'quizzes':
    case 'quiz':
      return 'quizzes'
    case 'reports':
      return 'reports'
    case 'appearance':
    case 'topics':
    case 'topic':
      return 'settings'
  }
}

const listeners = new Set<() => void>()

// Shows the page at once; the browser's hashchange arrives later and finds it shown.
export function navigate(route: Route): void {
  window.location.hash = href(route)
  listeners.forEach((l) => l())
}

// While `held`, a change of address (Back, a typed URL) is undone, so a running check is not
// left behind. pushState does not fire hashchange, so undoing does not loop.
export function useRoute(held: boolean): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  const shown = useRef(hash)
  const holding = useRef(held)
  useEffect(() => {
    holding.current = held
  }, [held])
  useEffect(() => {
    const onChange = () => {
      const next = window.location.hash
      if (next === shown.current) return
      if (holding.current) {
        window.history.pushState(null, '', shown.current || '#/')
        return
      }
      shown.current = next
      setHash(next)
    }
    window.addEventListener('hashchange', onChange)
    listeners.add(onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      listeners.delete(onChange)
    }
  }, [])
  return parseRoute(hash)
}
