import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function GuestRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return null;
  if (!user) return children;
  if (!profile?.profileComplete) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/app" replace />;
}
