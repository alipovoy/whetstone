export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export const capital = (s: string) => s[0].toUpperCase() + s.slice(1)
