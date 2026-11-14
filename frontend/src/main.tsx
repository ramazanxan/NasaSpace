import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  import('./store/useApp').then(({ useApp }) => Object.assign(window, { __app: useApp }))
}
