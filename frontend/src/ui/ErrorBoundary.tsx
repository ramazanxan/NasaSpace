import { Component, type ReactNode } from 'react'

/** Last line of defence: a render error shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash">
        <p className="crash__title">The map could not be drawn</p>
        <p className="muted">Reload the page. If the error persists, open a different region.</p>
        <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
          Reload page
        </button>
      </main>
    )
  }
}
