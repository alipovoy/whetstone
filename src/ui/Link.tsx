import type { AnchorHTMLAttributes } from 'react'
import { href, navigate, type Route } from './route'

interface Props extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
  // While Python checks code, leaving the page is blocked.
  held?: boolean
}

export function Link({ to, held = false, onClick, ...props }: Props) {
  return (
    <a
      {...props}
      href={href(to)}
      aria-disabled={held || undefined}
      onClick={(event) => {
        onClick?.(event)
        if (held) event.preventDefault()
        const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey
        if (event.defaultPrevented || !plain || event.altKey) return
        event.preventDefault()
        navigate(to)
      }}
    />
  )
}
