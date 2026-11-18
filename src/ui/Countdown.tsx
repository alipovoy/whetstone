import { Badge } from 'react-bootstrap'
import { formatClock } from '@/core/attempt'

export function Countdown({ ms }: { ms: number }) {
  return ms > 0 ? (
    <Badge bg="light" text="dark" className="border fs-6" title="Time left">
      {formatClock(ms)}
    </Badge>
  ) : (
    <Badge bg="warning" text="dark" className="fs-6">
      Time is up
    </Badge>
  )
}
