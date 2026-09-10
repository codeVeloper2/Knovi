import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

export default function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loader label="Loading your session…" />;
  }

  // No JWT / not logged in.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Backend already blocks unverified users from authenticated routes,
  // but guard here too for a clean redirect.
  if (!user.emailVerified) {
    return <Navigate to="/login" replace />;
  }

  // Onboarding gate: until the profile is complete, keep the user in the wizard.
  if (!profile?.profileComplete && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
