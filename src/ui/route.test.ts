import { describe, expect, it } from 'vitest'
import { href, parseRoute, sectionOf, type Route } from './route'

describe('routes', () => {
  const routes: Route[] = [
    { page: 'home' },
    { page: 'problems' },
    {
      page: 'problems',
      filter: { search: 'a&b=c?#', topic: 'my topic', offConcepts: ['Trees, graphs', 'a&b'] },
    },
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
    { page: 'library', list: 'problems' },
    { page: 'library', list: 'problems', filter: { topic: 't', source: 'user' }, disabled: true },
    { page: 'library-item', list: 'problems', topic: 'my topic', item: 'a/b' },
    { page: 'library', list: 'questions', filter: { type: 'multiple', difficulty: 'Hard' } },
    { page: 'library-item', list: 'questions', topic: 'my topic', item: 'a/b' },
    { page: 'add-items', list: 'problems' },
    { page: 'edit-item', list: 'problems', topic: 'my topic', item: 'a/b' },
    { page: 'edit-item', list: 'questions', topic: 't', item: 'q' },
    {
      page: 'add-items',
      list: 'problems',
      topic: 'a&b',
      concepts: ['X, y', 'Z'],
      difficulty: 'Medium',
    },
    { page: 'add-items', list: 'questions', topic: 't', difficulty: 'Easy' },
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
      '#/settings/problems/only-topic',
      '#/settings/topics/a/b',
      '#/coding/a/b/c',
      '#/settings/problems/t/p/view',
      '#/settings/problems/t/p/edit/more',
      '#/%E0',
    ])
      expect(parseRoute(hash)).toEqual({ page: 'home' })
  })

  it('opens the first page of a section given without one', () => {
    expect(parseRoute('#/reports')).toEqual({ page: 'reports', section: 'coding' })
    expect(parseRoute('#/settings')).toEqual({ page: 'appearance' })
  })

  it('drops unknown or empty filter values', () => {
    expect(
      parseRoute(
        '#/coding?difficulty=Insane&status=done&source=me&type=open&search=&area=X&without=&without=Y',
      ),
    ).toEqual({ page: 'problems', filter: { offConcepts: ['Y'] } })
    expect(parseRoute('#/settings/problems?disabled=yes')).toEqual({
      page: 'library',
      list: 'problems',
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
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
      'settings',
    ])
  })
})
