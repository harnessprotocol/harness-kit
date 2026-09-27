import React, { Suspense } from "react";
import { ErrorNotice } from "@harness-kit/ui";
import { errorDetails } from "../lib/error-details";

// How a failed lazy-route import reads in each engine: Chromium, WebKit
// (Tauri on macOS), Firefox.
const CHUNK_LOAD_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

/** A page's code chunk failed to load. React.lazy caches the rejection, so
 *  only a full reload fetches it again. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(message));
}

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
      // "Reload page" clears the boundary, which mounts the page afresh. A
      // failed chunk would re-throw at once from React.lazy's cache, so that
      // one reloads the window instead.
      const error = this.state.error;
      const reload = isChunkLoadError(error)
        ? () => window.location.reload()
        : () => this.setState({ error: null });
      return (
        <div data-testid="page-boundary-error" className="hk-page">
          <ErrorNotice
            title="This page hit an error"
            details={errorDetails(error)}
            action={{ label: "Reload page", onClick: reload }}
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
