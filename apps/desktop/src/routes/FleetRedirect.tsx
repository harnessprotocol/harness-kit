import { Navigate, useLocation } from "react-router-dom";

/**
 * /fleet is retired (Fleet's content folds into Machine — spec AC-1/AC-6).
 * The query string travels with it: a legacy `/fleet?harness=<id>` link
 * should land filtered on Machine, not on a blank unfiltered view.
 */
export function FleetRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/machine${search}`} replace />;
}
