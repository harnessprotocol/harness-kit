import React, { Suspense } from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetting: boolean;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, resetting: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, resetting: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageBoundary]", error, info.componentStack);
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    if (prevState.resetting && this.state.resetting) {
      // One commit has passed with resetting=true (children rendered as null).
      // Now it is safe to clear resetting — the caller will provide new children
      // via rerender, which won't throw.
      this.setState({ resetting: false });
    }
  }

  render() {
    if (this.state.error && !this.state.resetting) {
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
              this.setState({ error: null, resetting: true });
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

    if (this.state.resetting) {
      return null;
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
  const [resetKey, setResetKey] = React.useState(0);
  const handleReset = React.useCallback(() => setResetKey((k) => k + 1), []);

  return (
    <ErrorBoundary key={`${locationKey ?? ""}-${resetKey}`} onReset={handleReset}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
