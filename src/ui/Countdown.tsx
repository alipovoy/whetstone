import { formatClock } from '@/core/attempt'

export function Countdown({ ms, low = false }: { ms: number; low?: boolean }) {
  return ms > 0 ? (
    <span className="ws-clock" title="Time left" data-low={low || undefined}>
      {formatClock(ms)}
    </span>
  ) : (
    <span className="ws-clock" data-over>
      Time is up
    </span>
  )
}
