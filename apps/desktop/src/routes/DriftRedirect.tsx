import { Navigate, useLocation } from "react-router-dom";

/**
 * The legacy /drift route lands in Machine's Drift section. Governed by
 * specs/ux-consolidation/spec.md AC-6 (retired routes redirect and keep the
 * query the destination reads) and AC-7 (a harness in the query opens the
 * section filtered to it); AC-37 of the cross-harness spec places Drift
 * inside Machine. DriftPage reads `harness` from the URL, and dropping it
 * here made every Fleet row click arrive unfiltered.
 */
export function DriftRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("drift", "1");
  return <Navigate to={`/machine?${params.toString()}`} replace />;
}
