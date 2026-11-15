import { useApp } from '../store/useApp'

const STATUS = {
  unknown: { text: 'Connecting', title: 'Looking for the route server' },
  online: { text: 'Live data', title: 'Connected to the route server; all values come from NASA Mars Trek layers' },
  offline: { text: 'Map only', title: 'Route server is offline: the map and Trek layers work, routing does not' },
} as const

export function Brand() {
  const backend = useApp((s) => s.backend)
  const status = STATUS[backend]
  return (
    <header className="brand">
      <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="var(--c-rust)" />
        <path d="M6 19c5-3 9 2 14-1s6-1 7 0" stroke="var(--c-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      <span className="brand__name">NasaSpace</span>
      <span className={`brand__mode brand__mode--${backend}`} title={status.title}>
        <span className="brand__dot" aria-hidden />
        {status.text}
      </span>
    </header>
  )
}
