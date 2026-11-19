import type { QuestionType } from '@/content/schema'
import type { Grade } from '@/core/attempt'
import { SOLVED_SCORE, type ProblemStatus } from '@/core/problems'

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  new: 'New',
  'in-progress': 'In progress',
  solved: 'Solved',
  'needs-work': 'Needs work',
}

const STATUS_OPTION: Record<ProblemStatus, string> = {
  ...STATUS_LABEL,
  solved: `Solved (score ${SOLVED_SCORE} or more)`,
  'needs-work': `Needs work (score under ${SOLVED_SCORE})`,
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single choice',
  multiple: 'Multiple choice',
}

export const statusOptions = (statuses: readonly ProblemStatus[]) =>
  statuses.map((value) => ({ value, label: STATUS_OPTION[value] }))

export function ConceptTags({ names }: { names: string[] }) {
  return (
    <ul className="ws-concept-tags" aria-label="Concepts">
      {/* Names may repeat across a topic's concepts. */}
      {names.map((name, i) => (
        <li key={i}>{name}</li>
      ))}
    </ul>
  )
}

export function StatusPill({ status }: { status: ProblemStatus }) {
  return (
    <span className="ws-status" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function TestMarks({ grade }: { grade?: Grade }) {
  if (!grade) return <span className="ws-marks" />
  if (grade.tests.length === 0)
    return <span className="ws-marks text-body-secondary">No tests ran</span>
  const passed = grade.tests.filter((t) => t.passed).length
  const label = `${passed} of ${grade.tests.length} tests passed`
  return (
    <span className="ws-marks" role="img" aria-label={label} title={label}>
      {grade.tests.map((t, i) => (
        <i key={i} data-passed={t.passed} />
      ))}
    </span>
  )
}
