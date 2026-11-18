import { useEffect, useRef, useState } from 'react'
import { DIFFICULTIES } from '@/content/schema'
import { PROBLEM_STATUSES, type ProblemFilter } from '@/core/problems'

// Hash addresses need no server rewrite on GitHub Pages.
export type Route =
  | { page: 'home' }
  | { page: 'problems'; filter?: ProblemFilter }
  | { page: 'solve'; topic: string; problem: string }
  | { page: 'quizzes' }
  | { page: 'quiz'; id: string }
  | { page: 'reports'; section: 'coding'; filter?: ProblemFilter }
  | { page: 'reports'; section: 'quizzes' }
  | { page: 'attempt'; id: string }
  | { page: 'appearance' }
  | { page: 'topics' }
  | { page: 'topic'; id: string }

export type Section = 'home' | 'coding' | 'quizzes' | 'reports' | 'settings'

export function parseRoute(hash: string): Route {
  const mark = hash.indexOf('?')
  const address = mark < 0 ? hash : hash.slice(0, mark)
  const query = mark < 0 ? '' : hash.slice(mark + 1)
  const parts = address
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
      if (second) return { page: 'home' }
      return withFilter({ page: 'problems' }, query)
    case 'quizzes':
      if (third) return { page: 'home' }
      return second ? { page: 'quiz', id: second } : { page: 'quizzes' }
    case 'reports':
      if (second === 'coding' && third) return { page: 'attempt', id: third }
      if (third) return { page: 'home' }
      if (second === 'quizzes') return { page: 'reports', section: 'quizzes' }
      return withFilter({ page: 'reports', section: 'coding' }, query)
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
      return path('coding') + filterQuery(route.filter)
    case 'solve':
      return path('coding', route.topic, route.problem)
    case 'quizzes':
      return path('quizzes')
    case 'quiz':
      return path('quizzes', route.id)
    case 'reports':
      return route.section === 'coding'
        ? path('reports', 'coding') + filterQuery(route.filter)
        : path('reports', 'quizzes')
    case 'attempt':
      return path('reports', 'coding', route.id)
    case 'appearance':
      return path('settings', 'appearance')
    case 'topics':
      return path('settings', 'topics')
    case 'topic':
      return path('settings', 'topics', route.id)
  }
}

const TEXT_FILTERS = ['search', 'topic', 'area'] as const
const FILTER_KEYS = [...TEXT_FILTERS, 'difficulty', 'status'] as const

function withFilter<R extends Route & { filter?: ProblemFilter }>(route: R, query: string): R {
  const params = new URLSearchParams(query)
  const filter: ProblemFilter = {}
  for (const key of TEXT_FILTERS) {
    const value = params.get(key)
    if (value) filter[key] = value
  }
  const difficulty = DIFFICULTIES.find((d) => d === params.get('difficulty'))
  if (difficulty) filter.difficulty = difficulty
  const status = PROBLEM_STATUSES.find((s) => s === params.get('status'))
  if (status) filter.status = status
  return Object.keys(filter).length ? { ...route, filter } : route
}

function filterQuery(filter: ProblemFilter = {}): string {
  const params = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const value = filter[key]
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query && '?' + query
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
    case 'attempt':
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

// For changes within a page, such as a filter: Back skips them. replaceState fires no hashchange.
export function replaceRoute(route: Route): void {
  window.history.replaceState(null, '', href(route))
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
