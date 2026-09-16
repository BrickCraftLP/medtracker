import { Component } from 'react'

// The app had no error boundary at all, so any render error unmounted the whole
// tree and left a blank screen with nothing to act on — no message, no way back.
// The common case is a lazy route whose chunk no longer exists: after a deploy
// an installed PWA keeps serving the old index.html, and `import()` rejects.
// Suspense does not help there; it only covers a *pending* import.
//
// Labels are passed in rather than read from context: the root instance is
// mounted outside the providers, where a hook like useLanguage would itself
// throw and defeat the whole purpose.

const CHUNK_RE = /dynamically imported module|Importing a module script failed|ChunkLoadError/i

export const isChunkError = e => CHUNK_RE.test(e?.message ?? String(e ?? ''))

const DEFAULTS = {
  title: 'Something went wrong',
  chunk: 'A new version of the app is available.',
  action: 'Reload',
}

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const labels = { ...DEFAULTS, ...this.props.labels }
    const stale = isChunkError(error)

    return (
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: 24, textAlign: 'center', background: 'var(--bg-primary, #F2F2F7)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #111)', letterSpacing: -0.2 }}>
          {stale ? labels.chunk : labels.title}
        </div>
        {!stale && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary, #666)', maxWidth: 340, lineHeight: 1.45, wordBreak: 'break-word' }}>
            {error?.message ?? String(error)}
          </div>
        )}
        <button
          type="button"
          onClick={this.props.onReset ?? (() => window.location.reload())}
          style={{
            border: 'none', cursor: 'pointer', padding: '10px 20px', borderRadius: 12,
            background: 'var(--accent, #007AFF)', color: '#fff', fontSize: 14, fontWeight: 600,
          }}
        >
          {labels.action}
        </button>
      </div>
    )
  }
}
