import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * ErrorBoundary — catches unhandled React render errors and
 * shows a friendly recovery screen instead of a white/blank page.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console — wire to Sentry/Datadog here in production
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // Clear error state and let the app re-render from scratch
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #0f172a)',
        color: 'var(--text-primary, #f1f5f9)',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '24px',
      }}>
        <div style={{
          maxWidth: '520px',
          width: '100%',
          background: 'var(--surface-1, #1e293b)',
          border: '1px solid var(--rose, #f43f5e)',
          borderRadius: '16px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}>
          {/* Icon */}
          <div style={{
            width: '64px', height: '64px',
            background: 'rgba(244,63,94,0.15)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <AlertTriangle size={32} style={{ color: 'var(--rose, #f43f5e)' }} />
          </div>

          {/* Heading */}
          <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 28px', fontSize: '0.9rem', color: 'var(--text-muted, #94a3b8)', lineHeight: 1.6 }}>
            The app hit an unexpected error. Your data is safe — try reloading or returning to the home screen.
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: '8px', border: 'none',
                background: 'var(--primary, #6366f1)', color: '#fff',
                cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
              }}
            >
              <RefreshCw size={16} />
              Reload page
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                background: 'transparent', color: 'var(--text-primary, #f1f5f9)',
                cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
              }}
            >
              <Home size={16} />
              Go to login
            </button>
          </div>

          {/* Dev-only error details */}
          {isDev && this.state.error && (
            <details style={{ marginTop: '28px', textAlign: 'left' }}>
              <summary style={{
                cursor: 'pointer', fontSize: '0.78rem',
                color: 'var(--text-muted, #94a3b8)', marginBottom: '8px',
              }}>
                Error details (dev only)
              </summary>
              <pre style={{
                background: 'var(--surface-2, #0f172a)',
                border: '1px solid var(--border, #334155)',
                borderRadius: '8px', padding: '12px',
                fontSize: '0.72rem', overflowX: 'auto',
                color: 'var(--rose, #f43f5e)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: '200px', overflowY: 'auto',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
