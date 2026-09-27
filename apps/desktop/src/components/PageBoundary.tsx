import React, { Suspense } from "react";
import { ErrorNotice } from "@harness-kit/ui";
import { errorDetails } from "../lib/error-details";

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
      // "Reload page" clears the boundary, which mounts the page afresh.
      return (
        <div data-testid="page-boundary-error" className="hk-page">
          <ErrorNotice
            title="This page hit an error"
            details={errorDetails(this.state.error)}
            action={{ label: "Reload page", onClick: () => this.setState({ error: null }) }}
          />
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
