import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogoMark } from "./Logo";
import NotificationsBell from "./NotificationsPanel";

/**
 * MobileTopBar — compact header for mobile screens
 * Shows PeerUp branding on left, notification bell and avatar on right
 */
export default function MobileTopBar() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const name = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo = profile?.photoURL || user?.photoURL || "";

  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-brand">
        <span className="mobile-topbar-mark">
          <LogoMark size={24} />
        </span>
        <span className="mobile-topbar-name">
          Peer<span className="logo-accent">Up</span>
        </span>
      </div>
      <div className="mobile-topbar-actions">
        <NotificationsBell className="mobile-topbar-bell" />
        <button
          className="mobile-topbar-avatar"
          type="button"
          onClick={() => navigate("/app/settings")}
          aria-label={`${name} — open profile settings`}
          title={`${name} — open profile settings`}
        >
          {photo ? (
            <img src={photo} alt={name} referrerPolicy="no-referrer" />
          ) : (
            <span>{initial}</span>
          )}
        </button>
      </div>
    </header>
  );
}
