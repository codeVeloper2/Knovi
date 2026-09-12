import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import NotificationsBell from "../../../components/NotificationsPanel";

/**
 * Mobile-only header for all settings pages.
 * Hidden on desktop (768px+). Same hamburger/logo/notification/profile pattern.
 */
export default function SettingsMobileHeader() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const name    = profile?.displayName || user?.displayName || "";
  const photo   = profile?.photoURL    || user?.photoURL    || "";
  const initial = name.trim()[0]?.toUpperCase() || "?";

  return (
    <div className="settings-mob-header">
      <div className="settings-mob-left">
        <button
          className="settings-mob-menu-btn"
          aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="settings-mob-logo">
          Peer<span className="settings-mob-accent">Up</span>
        </span>
      </div>
      <div className="settings-mob-right">
        <NotificationsBell className="settings-mob-bell notif-bell-btn" />
        <button
          className="settings-mob-avatar"
          onClick={() => navigate("/app/settings")}
          aria-label="Profile"
        >
          {photo
            ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
            : <span>{initial}</span>
          }
        </button>
      </div>
    </div>
  );
}
