import { describe, expect, it } from 'vitest'
import { href, parseRoute, sectionOf, type Route } from './route'

describe('routes', () => {
  const routes: Route[] = [
    { page: 'home' },
    { page: 'problems' },
    { page: 'problems', filter: { search: 'a&b=c?#', topic: 'my topic', area: 'Trees / graphs' } },
    { page: 'problems', filter: { difficulty: 'Hard', status: 'needs-work' } },
    { page: 'solve', topic: 'my topic', problem: 'a/b' },
    { page: 'quizzes' },
    { page: 'quiz', id: 'q1' },
    { page: 'reports', section: 'coding' },
    { page: 'reports', section: 'coding', filter: { topic: 't', status: 'solved' } },
    { page: 'reports', section: 'quizzes' },
    { page: 'attempt', id: 'a/1' },
    { page: 'appearance' },
    { page: 'topics' },
    { page: 'topic', id: 't1' },
  ]

  it('reads back every address it writes, ids with any characters included', () => {
    for (const route of routes) expect(parseRoute(href(route))).toEqual(route)
  })

  it('opens Home for an empty or unknown address', () => {
    for (const hash of [
      '',
      '#',
      '#/',
      '#/nowhere',
      '#/coding/only-topic',
      '#/quizzes/a/b',
      '#/reports/quizzes/a',
      '#/%E0',
    ])
      expect(parseRoute(hash)).toEqual({ page: 'home' })
  })

  it('opens the first page of a section given without one', () => {
    expect(parseRoute('#/reports')).toEqual({ page: 'reports', section: 'coding' })
    expect(parseRoute('#/settings')).toEqual({ page: 'appearance' })
  })

  it('drops unknown or empty filter values', () => {
    expect(parseRoute('#/coding?difficulty=Insane&status=done&search=&area=X&color=red')).toEqual({
      page: 'problems',
      filter: { area: 'X' },
    })
    expect(parseRoute('#/coding?')).toEqual({ page: 'problems' })
    expect(href({ page: 'problems', filter: {} })).toBe('#/coding')
  })

  it('names the menu section of each page', () => {
    expect(routes.map(sectionOf)).toEqual([
      'home',
      'coding',
      'coding',
      'coding',
      'coding',
      'quizzes',
      'quizzes',
      'reports',
      'reports',
      'reports',
      'reports',
      'settings',
      'settings',
      'settings',
    ])
  })
})
