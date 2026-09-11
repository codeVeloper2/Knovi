import { useRef, useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_SHORTCUTS, SETTINGS_SHORTCUTS, displayKey } from "../shortcuts";
import { LogoMark } from "./Logo";
import ShortcutsModal from "./ShortcutsModal";
import ConfirmDialog from "./ConfirmDialog";
import * as api from "../api";
import {
  HomeIcon, DiscoverIcon, ChatIcon, RoomsIcon, LearnIcon,
  ProgressIcon, SettingsIcon, SearchIcon, MenuIcon, LogoutIcon,
  ChevronLeft, ChevronRight, ProfileIcon, SecurityIcon, BellIcon, MatchRequestsIcon,
} from "./DashIcons";

const MAIN_NAV = [
  { to: "/app",               label: "Home",           Icon: HomeIcon,           end: true },
  { to: "/app/discover",      label: "Discover",        Icon: DiscoverIcon },
  { to: "/app/chat",          label: "Chat",            Icon: ChatIcon },
  { to: "/app/match-requests",label: "Friend Requests", Icon: MatchRequestsIcon },
  { to: "/app/rooms",         label: "Study Rooms",     Icon: RoomsIcon },
  { to: "/app/learn",         label: "Learn",           Icon: LearnIcon },
  { to: "/app/progress",      label: "Progress",        Icon: ProgressIcon },
];

const SETTINGS_SUB = [
  { to: "/app/settings",              label: "Profile",       Icon: ProfileIcon,  end: true },
  { to: "/app/settings/subjects",     label: "Subjects",      Icon: LearnIcon },
  { to: "/app/settings/security",     label: "Security",      Icon: SecurityIcon },
  { to: "/app/settings/notifications",label: "Notifications", Icon: BellIcon },
];

const STORAGE_KEY = "peerup_sidebar_collapsed";

// Chevron down icon for the dropdown toggle
function ChevronDown({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{
        marginLeft: "auto",
        flexShrink: 0,
        transition: "transform 0.2s",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
      }}
    >
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

export default function DashboardLayout() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const inSettings = location.pathname.startsWith("/app/settings");

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);
  // Settings dropdown — auto-open if already on a settings route
  const [settingsOpen, setSettingsOpen] = useState(inSettings);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingMatchCount, setPendingMatchCount] = useState(0);
  const [pendingStudyCount, setPendingStudyCount] = useState(0);
  const searchRef = useRef(null);

  // Auto-open settings dropdown when navigating into settings
  useEffect(() => {
    if (inSettings) setSettingsOpen(true);
  }, [inSettings]);

  // Listen for the mobile hamburger custom event from child pages
  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("peerup:open-nav", handler);
    return () => window.removeEventListener("peerup:open-nav", handler);
  }, []);

  // Poll for badge counts every 30s
  useEffect(() => {
    let active = true;
    async function fetchCounts() {
      const [matchRes, studyRes] = await Promise.allSettled([
        api.getPendingRequestCount(),
        api.getPendingStudyInvitationCount(),
      ]);
      if (!active) return;
      if (matchRes.status === "fulfilled") setPendingMatchCount(matchRes.value.count ?? 0);
      if (studyRes.status === "fulfilled") setPendingStudyCount(studyRes.value.count ?? 0);
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // ── Keyboard shortcuts ──
  useKeyboardShortcuts([
    ...Object.entries(NAV_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    ...Object.entries(SETTINGS_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    { combo: "mod+b", run: () => toggle() },
    { combo: "/", run: () => searchRef.current?.focus() },
    { combo: "?", run: () => setScOpen(true), allowInInputs: false },
  ]);

  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  }

  return (
    <div className={`dash ${collapsed ? "dash--collapsed" : ""} ${mobileOpen ? "dash--mobile-open" : ""}`}>
      <div className="dash-overlay" onClick={() => setMobileOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className="dash-side">
        <div className="dash-side-top">
          <div className="dash-side-brand">
            <span className="dash-side-mark"><LogoMark size={26} /></span>
            <span className="dash-side-name">Peer<span className="logo-accent">Up</span></span>
          </div>

          {/* Close button — mobile drawer only */}
          <button
            className="dash-side-close"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Collapse button — desktop only */}
          <button
            className="dash-collapse"
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight width={18} height={18} /> : <ChevronLeft width={18} height={18} />}
          </button>
        </div>

        <nav className="dash-nav">
          {/* ── Main nav items ── */}
          {MAIN_NAV.map(({ to, label, Icon, end }) => {
            const sc    = NAV_SHORTCUTS[to];
            const badge =
              (to === "/app/match-requests" && pendingMatchCount > 0) ? pendingMatchCount :
              (to === "/app/rooms"           && pendingStudyCount > 0) ? pendingStudyCount :
              null;
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `dash-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
                title={label}
              >
                <span className="dash-link-icon-wrap">
                  <Icon />
                  {badge != null && (
                    <span className="dash-icon-badge">{badge > 9 ? "9+" : badge}</span>
                  )}
                </span>
                <span className="dash-link-label">{label}</span>
                {sc && (
                  <span className="dash-kbd">
                    {sc.keys.map((k, i) => <kbd key={i}>{displayKey(k)}</kbd>)}
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* ── Settings — dropdown trigger ── */}
          <button
            type="button"
            className={`dash-link dash-settings-toggle ${inSettings ? "active" : ""}`}
            onClick={() => {
              if (collapsed) {
                // When sidebar is collapsed, go straight to settings
                navigate("/app/settings");
                setMobileOpen(false);
              } else {
                setSettingsOpen((o) => !o);
              }
            }}
            title="Settings"
          >
            <span className="dash-link-icon-wrap">
              <SettingsIcon />
            </span>
            <span className="dash-link-label">Settings</span>
            {!collapsed && <ChevronDown open={settingsOpen} />}
          </button>

          {/* ── Settings sub-items (dropdown) ── */}
          {settingsOpen && !collapsed && (
            <div className="dash-settings-dropdown">
              {SETTINGS_SUB.map(({ to, label, Icon, end }) => {
                const sc = SETTINGS_SHORTCUTS[to];
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                    title={label}
                  >
                    <span className="dash-link-icon-wrap">
                      <Icon />
                    </span>
                    <span className="dash-link-label">{label}</span>
                    {sc && (
                      <span className="dash-kbd">
                        {sc.keys.map((k, i) => <kbd key={i}>{displayKey(k)}</kbd>)}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          )}
        </nav>

        <button className="dash-link dash-logout" type="button" onClick={() => setLogoutOpen(true)} title="Sign out">
          <span className="dash-link-icon-wrap"><LogoutIcon /></span>
          <span className="dash-link-label">Sign out</span>
        </button>
      </aside>

      {/* ── Main content ── */}
      <div className="dash-body">
        <header className="dash-topbar">
          <button className="dash-hamburger" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <MenuIcon />
          </button>

          <div className="dash-topbar-user">
            <span className="dash-topbar-hello">Hi,</span>
            <span className="dash-topbar-name">{name}</span>
          </div>

          <div className="dash-search">
            <SearchIcon width={18} height={18} />
            <input ref={searchRef} type="search" placeholder="Search students, subjects, or topics…  ( / )" />
          </div>

          <button className="dash-help" type="button" onClick={() => setScOpen(true)} title="Keyboard shortcuts ( ? )" aria-label="Keyboard shortcuts">
            <kbd>?</kbd>
          </button>

          <button
            className="dash-avatar"
            type="button"
            title={`${name} — open profile`}
            aria-label="Open your profile settings"
            onClick={() => navigate("/app/settings")}
          >
            {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : <span>{initial}</span>}
          </button>
        </header>

        <main className="dash-content">
          <Outlet />
        </main>
      </div>

      <ShortcutsModal open={scOpen} onClose={() => setScOpen(false)} />

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out of PeerUp?"
        message="You'll need to log in again to get back to your dashboard."
        confirmText="Sign out"
        cancelText="Stay signed in"
        danger
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => !loggingOut && setLogoutOpen(false)}
      />
    </div>
  );
}
