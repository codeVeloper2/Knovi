import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { LogoMark } from "./Logo";
import NotificationsBell from "./NotificationsPanel";

/**
 * MobileTopBar — compact header for mobile screens
 * Shows PeerUp branding on left, notification bell and avatar on right
 */
export default function MobileTopBar() {
  const { user, profile } = useAuth();
  const [showAvatar, setShowAvatar] = useState(false);

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
          onClick={() => setShowAvatar(true)}
          aria-label={`View ${name}'s full profile picture`}
          title="View profile picture"
        >
          {photo ? (
            <img src={photo} alt={name} referrerPolicy="no-referrer" />
          ) : (
            <span>{initial}</span>
          )}
        </button>
      </div>

      {showAvatar && (
        <div
          className="global-avatar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full profile picture"
          onClick={() => setShowAvatar(false)}
        >
          <button
            type="button"
            className="global-avatar-lightbox-close"
            onClick={() => setShowAvatar(false)}
            aria-label="Close profile picture"
          >
            ×
          </button>
          <div className="global-avatar-lightbox-content" onClick={(event) => event.stopPropagation()}>
            {photo ? (
              <img src={photo} alt={name} referrerPolicy="no-referrer" />
            ) : (
              <span>{initial}</span>
            )}
            <strong>{name}</strong>
          </div>
        </div>
      )}
      </div>
    </header>
  );
}
