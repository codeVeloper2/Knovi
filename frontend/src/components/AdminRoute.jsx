import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

/**
 * Wraps a route that requires role="admin".
 * Non-admins are silently redirected to /app (their dashboard).
 */
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <Loader label="Checking permissions…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/app" replace />;

  return children;
}
