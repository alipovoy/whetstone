import { formatClock } from '@/core/attempt'

export function Countdown({ ms }: { ms: number }) {
  return ms > 0 ? (
    <span className="ws-clock" title="Time left">
      {formatClock(ms)}
    </span>
  ) : (
    <span className="ws-clock" data-over>
      Time is up
    </span>
  )
}
