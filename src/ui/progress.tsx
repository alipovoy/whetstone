import type { Grade } from '@/core/attempt'
import type { ProblemStatus } from '@/core/problems'

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  new: 'New',
  'in-progress': 'In progress',
  solved: 'Solved',
  'needs-work': 'Needs work',
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
