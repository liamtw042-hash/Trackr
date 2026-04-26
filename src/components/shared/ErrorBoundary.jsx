import { Component } from 'react'

function ErrorFallback({ error, onReset }) {
  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-8 text-center border-loss/20">
        <div className="w-16 h-16 rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-loss" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-white/50 text-sm mb-1 leading-relaxed">
          An unexpected error occurred. Your trades and data are safe in Firebase.
        </p>
        {error?.message && (
          <p className="text-xs text-white/25 font-mono mb-5 mt-2 bg-white/3 rounded-lg px-3 py-2 text-left break-all">
            {error.message}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="btn-secondary flex-1 text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="btn-primary flex-1 text-sm"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
