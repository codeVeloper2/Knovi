import { useRef, useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_SHORTCUTS, SETTINGS_SHORTCUTS, BACK_SHORTCUT, displayKey } from "../shortcuts";
import { LogoMark } from "./Logo";
import ShortcutsModal from "./ShortcutsModal";
import ConfirmDialog from "./ConfirmDialog";
import * as api from "../api";
import {
  HomeIcon, DiscoverIcon, ChatIcon, RoomsIcon, LearnIcon,
  ProgressIcon, SettingsIcon, SearchIcon, MenuIcon, LogoutIcon,
  ChevronLeft, ChevronRight, ProfileIcon, SecurityIcon, BellIcon, BackIcon, MatchRequestsIcon,
} from "./DashIcons";

const MAIN_NAV = [
  { to: "/app", label: "Home", Icon: HomeIcon, end: true },
  { to: "/app/discover", label: "Discover", Icon: DiscoverIcon },
  { to: "/app/chat", label: "Chat", Icon: ChatIcon },
  { to: "/app/match-requests", label: "Match Requests", Icon: MatchRequestsIcon },
  { to: "/app/rooms", label: "Study Rooms", Icon: RoomsIcon },
  { to: "/app/learn", label: "Learn", Icon: LearnIcon },
  { to: "/app/progress", label: "Progress", Icon: ProgressIcon },
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

const SETTINGS_NAV = [
  { to: "/app/settings", label: "Profile", Icon: ProfileIcon, end: true },
  { to: "/app/settings/subjects", label: "Subjects", Icon: LearnIcon },
  { to: "/app/settings/security", label: "Security", Icon: SecurityIcon },
  { to: "/app/settings/notifications", label: "Notifications", Icon: BellIcon },
];

const STORAGE_KEY = "peerup_sidebar_collapsed";

export default function DashboardLayout() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scOpen, setScOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingMatchCount, setPendingMatchCount] = useState(0);
  const [pendingStudyCount, setPendingStudyCount] = useState(0);
  const searchRef = useRef(null);

  // Poll for pending match request count and study room invitations every 30s
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

  // Settings mode: sidebar shows the settings sub-nav.
  const inSettings = location.pathname.startsWith("/app/settings");
  const nav = inSettings ? SETTINGS_NAV : MAIN_NAV;

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // ── Keyboard shortcuts (from the central registry) ──
  useKeyboardShortcuts([
    // Main navigation: Ctrl/Cmd + letter -> route
    ...Object.entries(NAV_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    // Settings sub-nav (only meaningful in settings, but harmless elsewhere): Ctrl/Cmd + digit
    ...Object.entries(SETTINGS_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    // Back to main menu from settings
    { combo: BACK_SHORTCUT.combo, run: () => navigate("/app") },
    // Actions
    { combo: "mod+b", run: () => toggle() },
    { combo: "/", run: () => searchRef.current?.focus() },
    { combo: "?", run: () => setScOpen(true), allowInInputs: false },
  ]);

  const name = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo = profile?.photoURL || user?.photoURL || "";

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
          {inSettings ? (
            <button className="dash-back" type="button" onClick={() => navigate("/app")} title="Back to menu (Ctrl+M)">
              <BackIcon width={18} height={18} />
              <span className="dash-back-label">Menu</span>
              <span className="dash-kbd">
                {BACK_SHORTCUT.keys.map((k, i) => <kbd key={i}>{displayKey(k)}</kbd>)}
              </span>
            </button>
          ) : (
            <div className="dash-side-brand">
              <span className="dash-side-mark"><LogoMark size={26} /></span>
              <span className="dash-side-name">Peer<span className="logo-accent">Up</span></span>
            </div>
          )}
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

        {inSettings && <div className="dash-side-heading">Settings</div>}

        <nav className="dash-nav">
          {nav.map(({ to, label, Icon, end }) => {
            const sc = inSettings ? SETTINGS_SHORTCUTS[to] : NAV_SHORTCUTS[to];
            const badge =
              (to === "/app/match-requests" && pendingMatchCount > 0) ? pendingMatchCount :
              (to === "/app/rooms" && pendingStudyCount > 0) ? pendingStudyCount :
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
                {/* Icon wrapper — badge floats on top-right of the icon */}
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
        </nav>

        <button className="dash-link dash-logout" type="button" onClick={() => setLogoutOpen(true)} title="Sign out">
          <span className="dash-link-icon-wrap"><LogoutIcon /></span>
          <span className="dash-link-label">Sign out</span>
        </button>
      </aside>

      {/* ── Main ── */}
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
