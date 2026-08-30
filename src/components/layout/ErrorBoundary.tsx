import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Last line of defence. A render crash in one panel should show what broke
 * rather than a blank page — losing the whole app because a chart got a null
 * it didn't expect is worse than showing the stack.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[trackr] render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="surface max-w-lg w-full">
          <header className="section-head">
            <h1 className="sub-label text-down">Something broke</h1>
          </header>
          <div className="p-4 space-y-3">
            <p className="text-xs text-ink-200 leading-relaxed">
              A component failed to render. Your data is untouched — this is a display
              fault, not a write.
            </p>
            <pre className="text-2xs font-mono text-down bg-ink-950 surface p-2.5 overflow-x-auto whitespace-pre-wrap">
              {error.message}
            </pre>
            <div className="flex gap-2">
              <button onClick={() => this.setState({ error: null })} className="btn-ghost">
                Try again
              </button>
              <button onClick={() => window.location.reload()} className="btn-primary">
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
