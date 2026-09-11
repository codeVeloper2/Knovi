import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

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
        <button
          className="settings-mob-bell"
          aria-label="Notifications"
          onClick={() => navigate("/app/settings/notifications")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
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
