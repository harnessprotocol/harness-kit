import React, { Suspense } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[PageBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          data-testid="page-boundary-error"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 12,
            color: "var(--fg-muted)",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
          }}
        >
          <span style={{ fontSize: 13 }}>Something went wrong loading this page.</span>
          {import.meta.env.DEV && (
            <code style={{
              fontSize: 11,
              color: "var(--danger)",
              background: "var(--bg-elevated)",
              padding: "6px 12px",
              borderRadius: 6,
              maxWidth: 480,
              textAlign: "center",
            }}>
              {this.state.error.message}
            </code>
          )}
          <button
            onClick={() => {
              this.setState({ error: null });
            }}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid var(--border-base)",
              borderRadius: 6,
              background: "var(--bg-elevated)",
              color: "var(--fg-base)",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function PageLoader() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: "var(--fg-subtle)",
      fontSize: 13,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    }}>
      Loading…
    </div>
  );
}

interface PageBoundaryProps {
  children: React.ReactNode;
  /** Changing this key forces the boundary to remount (e.g. on navigation). */
  locationKey?: string;
}

export function PageBoundary({ children, locationKey }: PageBoundaryProps) {
  return (
    <ErrorBoundary key={locationKey ?? ""}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
