import { useSyncExternalStore } from 'react'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(listener: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, () => darkQuery().matches)
}

export function followSystemTheme(): void {
  const apply = () =>
    document.documentElement.setAttribute('data-bs-theme', darkQuery().matches ? 'dark' : 'light')
  apply()
  subscribe(apply)
}
