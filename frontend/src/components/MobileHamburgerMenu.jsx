import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  HomeIcon, DiscoverIcon, ChatIcon, ChallengeIcon, LearnIcon,
  ProgressIcon, SettingsIcon, LogoutIcon,
} from "./DashIcons";
import { LogoMark } from "./Logo";

const NAV_ITEMS = [
  { to: "/app",           label: "Home",      Icon: HomeIcon,      end: true },
  { to: "/app/discover",  label: "Discover",  Icon: DiscoverIcon },
  { to: "/app/learn",     label: "Learn",     Icon: LearnIcon },
  { to: "/app/chat",      label: "Chat",      Icon: ChatIcon },
  { to: "/app/challenge", label: "Challenge", Icon: ChallengeIcon },
  { to: "/app/progress",  label: "Progress",  Icon: ProgressIcon },
  { to: "/app/settings",  label: "Settings",  Icon: SettingsIcon },
];

export default function MobileHamburgerMenu({ open, onClose, onLogout }) {
  const { user, profile } = useAuth();
  const location = useLocation();
  const drawerRef = useRef(null);

  // Touch swipe-to-close (swipe left on the drawer)
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  // Close on route change
  useEffect(() => { onClose(); }, [location.pathname]); // eslint-disable-line

  // Lock scroll + Escape key
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Swipe left at least 60px, mostly horizontal
    if (dx < -60 && dy < 80) onClose();
    touchStartX.current = null;
    touchStartY.current = null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`hmenu-backdrop${open ? " hmenu-backdrop--open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={`hmenu-drawer${open ? " hmenu-drawer--open" : ""}`}
        aria-label="Main navigation"
        aria-modal="true"
        role="dialog"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drawer header */}
        <div className="hmenu-header">
          <div className="hmenu-brand">
            <LogoMark size={22} />
            <span className="hmenu-brand-name">Peer<span className="logo-accent">Up</span></span>
          </div>
          <button
            type="button"
            className="hmenu-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="4" x2="4"  y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* User identity */}
        <div className="hmenu-user">
          <div className="hmenu-avatar">
            {photo
              ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
              : <span>{initial}</span>}
          </div>
          <div className="hmenu-user-info">
            <strong>{name}</strong>
            <span>{user?.email || ""}</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="hmenu-nav">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `hmenu-item${isActive ? " hmenu-item--active" : ""}`}
            >
              <span className="hmenu-item-icon"><Icon width={20} height={20} /></span>
              <span className="hmenu-item-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="hmenu-divider" />

        {/* Logout */}
        <button
          type="button"
          className="hmenu-item hmenu-item--logout"
          onClick={() => { onClose(); onLogout?.(); }}
        >
          <span className="hmenu-item-icon"><LogoutIcon width={20} height={20} /></span>
          <span className="hmenu-item-label">Sign out</span>
        </button>

        {/* Swipe hint */}
        <p className="hmenu-swipe-hint">← Swipe left to close</p>
      </aside>
    </>
  );
}
