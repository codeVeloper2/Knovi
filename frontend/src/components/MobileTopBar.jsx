import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import { LogoMark } from "./Logo";
import NotificationsBell from "./NotificationsPanel";

function HamburgerIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"
      style={{ transition: "transform 0.2s" }}>
      {open ? (
        <>
          <line x1="4" y1="4"  x2="18" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="18" y1="4" x2="4"  y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </>
      ) : (
        <>
          <line x1="3" y1="6"  x2="19" y2="6"  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
        </>
      )}
    </svg>
  );
}

/**
 * MobileTopBar — fixed header for mobile.
 * Props:
 *   drawerOpen   {boolean}   — is the hamburger drawer open?
 *   onHamburger  {function}  — toggle the drawer
 */
export default function MobileTopBar({ drawerOpen, onHamburger }) {
  const { user, profile } = useAuth();
  const [showAvatar, setShowAvatar] = useState(false);
  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  return (
    <header className="mobile-topbar">
      {/* Hamburger button — left side */}
      <button
        type="button"
        className={`mobile-topbar-hamburger${drawerOpen ? " open" : ""}`}
        onClick={onHamburger}
        aria-label={drawerOpen ? "Close menu" : "Open menu"}
        aria-expanded={drawerOpen}
      >
        <HamburgerIcon open={drawerOpen} />
      </button>

      {/* Brand — centred */}
      <div className="mobile-topbar-brand">
        <span className="mobile-topbar-mark"><LogoMark size={24} /></span>
        <span className="mobile-topbar-name">Peer<span className="logo-accent">Up</span></span>
      </div>

      {/* Bell + avatar — right side */}
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
        <div
          className="global-avatar-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full profile picture"
          onClick={() => setShowAvatar(false)}
        >
          <button type="button" className="global-avatar-lightbox-close"
            onClick={() => setShowAvatar(false)} aria-label="Close">×</button>
          <div className="global-avatar-lightbox-content"
            onClick={e => e.stopPropagation()}>
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
