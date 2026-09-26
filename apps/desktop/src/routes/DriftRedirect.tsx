import { Navigate, useLocation } from "react-router-dom";
import { withView } from "../pages/machine/machine-view-model";

/**
 * The legacy /drift route lands on Machine's Drift view (`view=drift`).
 * Governed by specs/ux-consolidation/spec.md AC-6 (retired routes redirect
 * and keep the query the destination reads), AC-7 (a harness in the query
 * opens Drift filtered to it) and AC-18 (Drift is a view of Machine). DriftPage
 * reads `harness` from the URL, and dropping it here made every Fleet row
 * click arrive unfiltered.
 */
export function DriftRedirect() {
  const { search } = useLocation();
  const params = withView(new URLSearchParams(search), "drift");
  return <Navigate to={`/machine?${params.toString()}`} replace />;
}
