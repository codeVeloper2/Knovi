import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { LogoMark } from "./Logo";
import NotificationsBell from "./NotificationsPanel";

/** Clean modern hamburger / close icon */
function HamburgerIcon({ open }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        /* X — two diagonal lines */
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </g>
      ) : (
        /* Three lines — top full, middle short, bottom full */
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3"  y1="6"  x2="21" y2="6"  />
          <line x1="6"  y1="12" x2="21" y2="12" />
          <line x1="3"  y1="18" x2="21" y2="18" />
        </g>
      )}
    </svg>
  );
}

export default function MobileTopBar({ drawerOpen, onHamburger }) {
  const { user, profile } = useAuth();
  const [showAvatar, setShowAvatar] = useState(false);
  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  return (
    <header className="mobile-topbar">

      {/* LEFT: hamburger + logo together */}
      <div className="mobile-topbar-left">
        <button
          type="button"
          className={`mobile-topbar-hamburger${drawerOpen ? " open" : ""}`}
          onClick={onHamburger}
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
          aria-expanded={drawerOpen}
        >
          <HamburgerIcon open={drawerOpen} />
        </button>

        <div className="mobile-topbar-brand">
          <span className="mobile-topbar-mark"><LogoMark size={22} /></span>
          <span className="mobile-topbar-name">Kno<span className="logo-accent">vi</span></span>
        </div>
      </div>

      {/* RIGHT: bell + avatar — not touching edge */}
      <div className="mobile-topbar-actions">
        <NotificationsBell className="mobile-topbar-bell" />
        <button
          className="mobile-topbar-avatar"
          type="button"
          onClick={() => setShowAvatar(true)}
          aria-label={`View ${name}'s profile picture`}
        >
          {photo
            ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
            : <span>{initial}</span>}
        </button>
      </div>

      {showAvatar && (
        <div className="global-avatar-lightbox" role="dialog" aria-modal="true"
          aria-label="Full profile picture" onClick={() => setShowAvatar(false)}>
          <button type="button" className="global-avatar-lightbox-close"
            onClick={() => setShowAvatar(false)} aria-label="Close">×</button>
          <div className="global-avatar-lightbox-content" onClick={e => e.stopPropagation()}>
            {photo
              ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
              : <span>{initial}</span>}
            <strong>{name}</strong>
          </div>
        </div>
      )}
    </header>
  );
}
