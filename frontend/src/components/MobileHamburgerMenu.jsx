import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  HomeIcon, DiscoverIcon, ChatIcon, ChallengeIcon, LearnIcon,
  ProgressIcon, SettingsIcon, LogoutIcon,
} from "./DashIcons";
import { LogoMark } from "./Logo";

/* ── Sectioned nav config ─────────────────────────────────────────────────────
   MENU     → core app surfaces
   LEARN    → study / compete / track
   ACCOUNT  → settings + sign out
─────────────────────────────────────────────────────────────────────────────── */
const MENU_ITEMS = [
  { to: "/app",          label: "Home",     Icon: HomeIcon,     iconMod: "home",     end: true },
  { to: "/app/discover", label: "Discover", Icon: DiscoverIcon, iconMod: "discover" },
  { to: "/app/chat",     label: "Chat",     Icon: ChatIcon,     iconMod: "chat" },
];

const LEARN_ITEMS = [
  { to: "/app/learn",     label: "Learn",     Icon: LearnIcon,     iconMod: "learn" },
  { to: "/app/challenge", label: "Challenge", Icon: ChallengeIcon, iconMod: "challenge" },
  { to: "/app/progress",  label: "Progress",  Icon: ProgressIcon,  iconMod: "progress" },
];

function NavItem({ to, label, Icon, iconMod, end, onNavigate, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={(e) => {
        if (onNavigate && onNavigate(to) === false) e.preventDefault();
      }}
      className={({ isActive }) =>
        `hmenu-item${isActive ? " hmenu-item--active" : ""}`
      }
    >
      <span className={`hmenu-item-icon hmenu-item-icon--${iconMod}`} aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className="hmenu-item-label">{label}</span>
      {badge != null && (
        <span className="hmenu-item-badge">{badge}</span>
      )}
      {/* Active indicator bar — left accent */}
      <span className="hmenu-item-indicator" aria-hidden="true" />
    </NavLink>
  );
}

export default function MobileHamburgerMenu({ open, onClose, onLogout, onNavigate }) {
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
              Kno<span className="logo-accent">vi</span>
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
          {/* ── MENU ── */}
          <span className="hmenu-section-label">Menu</span>
          {MENU_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onNavigate} />
          ))}

          <div className="hmenu-divider" />

          {/* ── LEARN ── */}
          <span className="hmenu-section-label">Learn</span>
          {LEARN_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onNavigate={onNavigate} />
          ))}

          <div className="hmenu-divider" />

          {/* ── ACCOUNT ── */}
          <span className="hmenu-section-label">Account</span>

          <NavLink
            to="/app/settings"
            onClick={(e) => {
              if (onNavigate && onNavigate("/app/settings") === false) e.preventDefault();
            }}
            className={({ isActive }) =>
              `hmenu-item${isActive ? " hmenu-item--active" : ""}`
            }
          >
            <span className="hmenu-item-icon hmenu-item-icon--settings" aria-hidden="true">
              <SettingsIcon width={18} height={18} />
            </span>
            <span className="hmenu-item-label">Settings</span>
            <span className="hmenu-item-indicator" aria-hidden="true" />
          </NavLink>

          <button
            type="button"
            className="hmenu-item hmenu-item--logout"
            onClick={() => { onClose(); onLogout?.(); }}
          >
            <span className="hmenu-item-icon hmenu-item-icon--logout" aria-hidden="true">
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
