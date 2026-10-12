import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../lib/api";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to={"/login?redirect=" + encodeURIComponent(loc.pathname + loc.search)} replace />;
  }
  return <>{children}</>;
}
