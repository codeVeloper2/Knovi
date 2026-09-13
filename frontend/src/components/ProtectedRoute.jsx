import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader label="Loading your session…" />;

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (!user.emailVerified) return <Navigate to="/login" replace />;

  // Admin users should never be inside /app — redirect them to /admin
  if (user.role === "admin") return <Navigate to="/admin" replace />;

  if (!profile?.profileComplete && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
