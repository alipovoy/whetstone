import type { ReactNode } from 'react'
import type { Problem, Question, Topic, TopicFile } from '@/content/schema'
import {
  PROBLEM_TEMPLATE,
  problemRequest,
  QUESTION_TEMPLATE,
  questionRequest,
  type ItemOrder,
  type PromptRequest,
} from '@/core/bridge'
import { addProblems, addQuestions, type Adder, type ItemList } from '@/core/topics'
import { checkProblem } from './check'
import { ProblemView, QuestionView } from './LibraryPages'
import type { Runner } from './ProblemPage'
import { Statement } from './Statement'

export type Check = Pick<Runner, 'test'>

// What sets problems apart from questions where both are added and edited.
export interface Kind<T> {
  list: ItemList
  noun: string
  back: string
  template: string
  request: (request: PromptRequest, order: ItemOrder) => string
  existing: (file: TopicFile) => string[]
  add: Adder<T>
  // How an item is checked, beyond the content rules when `check` is given.
  rules: string
  check?: (runner: Check, item: T) => Promise<string[]>
  // A short look while adding, and the whole item while editing.
  preview: (topic: Topic, item: T) => ReactNode
  view: (topic: Topic, item: T) => ReactNode
}

const PROBLEMS: Kind<Problem> = {
  list: 'problems',
  noun: 'problem',
  back: 'Back to coding problems',
  template: PROBLEM_TEMPLATE,
  request: problemRequest,
  existing: (file) => file.problems.map((p) => p.wordings[0].title),
  add: addProblems,
  rules:
    'Each problem is run in Python: its reference solution must pass every test and its starter code must fail one.',
  check: checkProblem,
  preview: (topic, problem) => (
    <Statement topic={topic} problem={problem} wording={problem.wordings[0]} preview />
  ),
  view: (topic, problem) => <ProblemView topic={topic} problem={problem} />,
}

const QUESTIONS: Kind<Question> = {
  list: 'questions',
  noun: 'question',
  back: 'Back to quiz questions',
  template: QUESTION_TEMPLATE,
  request: questionRequest,
  existing: (file) => file.questions.map((q) => q.summary),
  add: addQuestions,
  rules:
    'Each question is checked: its answers must be options, a single choice has one, and at least one option is wrong.',
  preview: (topic, question) => <QuestionView topic={topic} question={question} preview />,
  view: (topic, question) => <QuestionView topic={topic} question={question} />,
}

export const KINDS = { problems: PROBLEMS, questions: QUESTIONS }
