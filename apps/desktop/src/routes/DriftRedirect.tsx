import { Navigate, useLocation } from "react-router-dom";

/**
 * The legacy /drift route lands in Machine's Drift section (AC-37 of the
 * cross-harness spec). The query string travels with it: DriftPage reads
 * `harness` from the URL, and dropping it here made every Fleet row click
 * arrive unfiltered.
 */
export function DriftRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("drift", "1");
  return <Navigate to={`/machine?${params.toString()}`} replace />;
}
