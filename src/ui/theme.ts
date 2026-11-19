import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type Scheme = 'slate' | 'mint' | 'sunset' | 'amber' | 'emerald' | 'rainbow'
export type SideMenu = 'open' | 'closed'

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark']
export const SCHEMES: Scheme[] = ['slate', 'mint', 'sunset', 'amber', 'emerald', 'rainbow']

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

// Display preferences of this browser, not practice data, so they live in localStorage.
function preference<T extends string>(key: string, values: T[]) {
  let value = values[0]
  return {
    get: () => value,
    load() {
      try {
        const stored = localStorage.getItem(key)
        value = values.find((v) => v === stored) ?? values[0]
      } catch {
        value = values[0]
      }
    },
    set(next: T) {
      value = next
      try {
        localStorage.setItem(key, next)
      } catch {
        // Without storage the choice holds until reload.
      }
      changed()
    },
  }
}

const theme = preference('whetstone.theme', THEME_CHOICES)
const scheme = preference('whetstone.scheme', SCHEMES)
const sideMenu = preference<SideMenu>('whetstone.side-menu', ['open', 'closed'])

const isDark = () => theme.get() === 'dark' || (theme.get() === 'system' && darkQuery().matches)

function changed() {
  const root = document.documentElement
  root.setAttribute('data-bs-theme', isDark() ? 'dark' : 'light')
  root.setAttribute('data-ws-scheme', scheme.get())
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const setThemeChoice = theme.set
export const setScheme = scheme.set
export const setSideMenu = sideMenu.set

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, theme.get)
}

export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, scheme.get)
}

export function useSideMenu(): SideMenu {
  return useSyncExternalStore(subscribe, sideMenu.get)
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark)
}

export function applyPreferences(): void {
  theme.load()
  scheme.load()
  sideMenu.load()
  changed()
  darkQuery().addEventListener('change', changed)
}
