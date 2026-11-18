import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

// A display preference of this browser, not practice data, so it lives in localStorage.
const KEY = 'whetstone.theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return THEME_CHOICES.find((c) => c === value) ?? 'system'
  } catch {
    return 'system'
  }
}

let choice: ThemeChoice = 'system'

const isDark = () => choice === 'dark' || (choice === 'system' && darkQuery().matches)

function changed() {
  document.documentElement.setAttribute('data-bs-theme', isDark() ? 'dark' : 'light')
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Without storage the choice holds until reload.
  }
  changed()
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice)
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark)
}

export function applyTheme(): void {
  choice = readChoice()
  changed()
  darkQuery().addEventListener('change', changed)
}
