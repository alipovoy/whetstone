const PATHS = {
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  quiz: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9H17M14.5 15H17',
  reports: 'M3 21h18M6 17v-5M11 17V6M16 17v-8M21 17v-3',
  settings:
    'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  system: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  light:
    'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dark: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-up': 'M6 15l6-6 6 6',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  shuffle:
    'M3 7h3c4 0 6 10 10 10h5M3 17h3c1.5 0 2.7-1.4 3.8-3M14.2 10c1.1-1.6 2.3-3 3.8-3h3M18 4l3 3-3 3M18 14l3 3-3 3',
}

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ws-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Logo() {
  return (
    <svg className="ws-logo" viewBox="0 0 32 32" aria-hidden="true">
      <g transform="rotate(-14 16 16)">
        <rect x="3" y="11" width="26" height="11" rx="2" fill="var(--ws-accent)" />
        <rect x="3" y="11" width="26" height="3.5" rx="1.5" fill="var(--ws-accent-strong)" />
      </g>
      <path d="M6 27h20" stroke="var(--ws-muted)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
