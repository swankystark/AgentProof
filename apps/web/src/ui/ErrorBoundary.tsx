import React, { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

type Props = {
  readonly children: ReactNode
  readonly fallbackMessage?: string
}

type State = {
  readonly hasError: boolean
  readonly error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo)
    try {
      sessionStorage.setItem("agentproof_last_react_error", JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }))
    } catch {
      // ignore
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="page-wrap" style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
          <div className="panel" style={{ maxWidth: "480px", padding: "2rem", textAlign: "center" }}>
            <div style={{ display: "inline-flex", padding: "12px", background: "rgba(220, 38, 38, 0.1)", borderRadius: "50%", color: "var(--status-error)", marginBottom: "1rem" }}>
              <AlertTriangle size={28} />
            </div>
            <h2 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem 0" }}>Something unexpected occurred</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0 0 1.5rem 0" }}>
              {this.props.fallbackMessage ?? "A view transition encountered an error. You can refresh or return to the overview."}
            </p>
            {this.state.error && (
              <pre style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.04)", padding: "0.75rem", borderRadius: "6px", textAlign: "left", overflowX: "auto", marginBottom: "1.5rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button className="button button-primary" onClick={this.handleReset}>
                <RefreshCw size={14} /> Refresh page
              </button>
              <button className="button button-secondary" onClick={() => { window.location.href = "/" }}>
                Go to Overview
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
