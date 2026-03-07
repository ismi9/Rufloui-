import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error('[RuFloUI] Uncaught error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleHardReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, errorInfo } = this.state
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          maxWidth: 600, width: '100%', padding: 32,
          background: 'var(--bg-card)', border: '1px solid var(--accent-red)',
          borderRadius: 12, boxShadow: '0 0 40px rgba(239, 68, 68, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>!</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                An unexpected error occurred in the application
              </div>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16, marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-red)', marginBottom: 8 }}>
              {error?.name}: {error?.message}
            </div>
            <pre style={{
              fontSize: 11, color: 'var(--text-muted)', margin: 0,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 200, overflow: 'auto', lineHeight: 1.6,
            }}>
              {errorInfo?.componentStack?.trim()}
            </pre>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={this.handleReload} style={{
              flex: 1, padding: '10px 16px', fontSize: 14, fontWeight: 600,
              background: 'var(--accent-blue)', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>
              Try Again
            </button>
            <button onClick={this.handleHardReload} style={{
              flex: 1, padding: '10px 16px', fontSize: 14, fontWeight: 600,
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
            }}>
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
