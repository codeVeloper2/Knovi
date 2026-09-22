import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  HomeIcon, DiscoverIcon, ChatIcon, ChallengeIcon, LearnIcon,
  ProgressIcon, SettingsIcon, LogoutIcon,
} from "./DashIcons";
import { LogoMark } from "./Logo";

const NAV_ITEMS = [
  { to: "/app",           label: "Home",      Icon: HomeIcon,      iconMod: "home",      end: true },
  { to: "/app/discover",  label: "Discover",  Icon: DiscoverIcon,  iconMod: "discover" },
  { to: "/app/learn",     label: "Learn",     Icon: LearnIcon,     iconMod: "learn" },
  { to: "/app/chat",      label: "Chat",      Icon: ChatIcon,      iconMod: "chat",      badge: null },
  { to: "/app/challenge", label: "Challenge", Icon: ChallengeIcon, iconMod: "challenge" },
  { to: "/app/progress",  label: "Progress",  Icon: ProgressIcon,  iconMod: "progress" },
];

export default function MobileHamburgerMenu({ open, onClose, onLogout }) {
  const { user, profile } = useAuth();
  const location = useLocation();
  const drawerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";
  const email   = user?.email || "";

  /* Close on route change */
  useEffect(() => { onClose(); }, [location.pathname]); // eslint-disable-line

  /* Lock scroll + Escape key */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
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
        {/* Header */}
        <div className="hmenu-header">
          <div className="hmenu-brand">
            <div className="hmenu-brand-logo">
              <LogoMark size={17} />
            </div>
            <span className="hmenu-brand-name">
              Peer<span className="logo-accent">Up</span>
            </span>
          </div>
          <button
            type="button"
            className="hmenu-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <line x1="2" y1="2" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="13" y1="2" x2="2" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* User card */}
        <div className="hmenu-user">
          <div className="hmenu-avatar">
            {photo
              ? <img src={photo} alt={name} referrerPolicy="no-referrer" />
              : <span>{initial}</span>}
          </div>
          <div className="hmenu-user-info">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>

        </div>

        {/* Nav */}
        <nav className="hmenu-nav">
          <span className="hmenu-section-label">Menu</span>

          {NAV_ITEMS.map(({ to, label, Icon, iconMod, badge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `hmenu-item${isActive ? " hmenu-item--active" : ""}`
              }
            >
              <span className={`hmenu-item-icon hmenu-item-icon--${iconMod}`}>
                <Icon width={18} height={18} />
              </span>
              <span className="hmenu-item-label">{label}</span>
              {badge != null && (
                <span className="hmenu-item-badge">{badge}</span>
              )}
            </NavLink>
          ))}

          <div className="hmenu-divider" />
          <span className="hmenu-section-label">Account</span>

          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              `hmenu-item${isActive ? " hmenu-item--active" : ""}`
            }
          >
            <span className="hmenu-item-icon hmenu-item-icon--settings">
              <SettingsIcon width={18} height={18} />
            </span>
            <span className="hmenu-item-label">Settings</span>
          </NavLink>

          <div className="hmenu-divider" />

          <button
            type="button"
            className="hmenu-item hmenu-item--logout"
            onClick={() => { onClose(); onLogout?.(); }}
          >
            <span className="hmenu-item-icon hmenu-item-icon--logout">
              <LogoutIcon width={18} height={18} />
            </span>
            <span className="hmenu-item-label">Sign out</span>
          </button>
        </nav>

        <p className="hmenu-swipe-hint">← Swipe left to close</p>
      </aside>
    </>
  );
}
