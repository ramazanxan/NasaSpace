import { usingMocks } from '../api/client'

export function Brand() {
  return (
    <header className="brand">
      <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="var(--c-rust)" />
        <path d="M6 19c5-3 9 2 14-1s6-1 7 0" stroke="var(--c-accent)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      <span className="brand__name">NasaSpace</span>
      {usingMocks && <span className="brand__mode" title="VITE_API_URL не задан: данные генерируются в браузере">Демо-данные</span>}
    </header>
  )
}
