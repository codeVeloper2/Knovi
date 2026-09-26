import { useRef, useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_SHORTCUTS, SETTINGS_SHORTCUTS, BACK_SHORTCUT, displayKey } from "../shortcuts";
import { LogoMark } from "./Logo";
import ShortcutsModal from "./ShortcutsModal";
import ConfirmDialog from "./ConfirmDialog";
import NotificationsBell from "./NotificationsPanel";
import MobileTopBar from "./MobileTopBar";
import MobileHamburgerMenu from "./MobileHamburgerMenu";
import FeedbackWidget from "./FeedbackWidget";
import {
  HomeIcon, DiscoverIcon, ChatIcon, ChallengeIcon, LearnIcon,
  ProgressIcon, SettingsIcon, LogoutIcon,
  ChevronRight, ProfileIcon, SecurityIcon, BellIcon,
} from "./DashIcons";

// ── Nav configuration ──────────────────────────────────────────────────────────

const MAIN_NAV = [
  { to: "/app",           label: "Home",      Icon: HomeIcon,      end: true },
  { to: "/app/discover",  label: "Discover",  Icon: DiscoverIcon },
  { to: "/app/chat",      label: "Chat",      Icon: ChatIcon },
  { to: "/app/challenge", label: "Challenge", Icon: ChallengeIcon },
  { to: "/app/learn",     label: "Learn",     Icon: LearnIcon },
  { to: "/app/progress",  label: "Progress",  Icon: ProgressIcon },
];

const DESKTOP_MAIN_NAV = [
  ...MAIN_NAV,
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

const SETTINGS_NAV = [
  { to: "/app/settings",                  label: "Settings",         Icon: SettingsIcon, end: true },
  { to: "/app/settings/profile",          label: "Profile",          Icon: ProfileIcon },
  { to: "/app/settings/learning-profile", label: "Learning Profile", Icon: LearnIcon },
  { to: "/app/settings/security",         label: "Security",         Icon: SecurityIcon },
  { to: "/app/settings/notifications",    label: "Notifications",    Icon: BellIcon },
];

const STORAGE_KEY = "knovi_sidebar_collapsed";

function ChevronDown({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ marginLeft: "auto", flexShrink: 0, transition: "transform 0.2s",
        transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

export default function DashboardLayout() {
  const { user, profile, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [collapsed,            setCollapsed]            = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [drawerOpen,           setDrawerOpen]           = useState(false);
  const [scOpen,               setScOpen]               = useState(false);
  const [logoutOpen,           setLogoutOpen]           = useState(false);
  const [exitRoomOpen,         setExitRoomOpen]         = useState(false);
  const [pendingNavigation,    setPendingNavigation]    = useState(null);
  const [loggingOut,           setLoggingOut]           = useState(false);
  const [desktopSettingsHover, setDesktopSettingsHover] = useState(false);
  const settingsLeaveTimer = useRef(null);

  function openSettings()  { clearTimeout(settingsLeaveTimer.current); setDesktopSettingsHover(true);  }
  function closeSettings() { settingsLeaveTimer.current = setTimeout(() => setDesktopSettingsHover(false), 120); }

  const inSettings     = location.pathname.startsWith("/app/settings");
  const isLearn        = location.pathname.startsWith("/app/learn");
  const isChat         = location.pathname.startsWith("/app/chat");
  const isAISessionRoom = location.pathname.startsWith("/app/learn/ai/session/");

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 820);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 820); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Swipe-from-left-edge gesture to open drawer ──────────────────────────────
  // Zone is 44px from left edge — wide enough to not clash with Android back gesture
  const edgeTouchStart = useRef(null);
  useEffect(() => {
    if (!isMobile) return;

    function onTouchStart(e) {
      // Accept swipe from anywhere on screen
      edgeTouchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }

    function onTouchMove(e) {
      if (!edgeTouchStart.current || drawerOpen) return;
      const dx = e.touches[0].clientX - edgeTouchStart.current.x;
      const dy = Math.abs(e.touches[0].clientY - edgeTouchStart.current.y);
      // Open as soon as they've dragged 50px right and it's mostly horizontal
      if (dx > 50 && dy < 60) {
        setDrawerOpen(true);
        edgeTouchStart.current = null;
      }
    }

    function onTouchEnd() {
      edgeTouchStart.current = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove",  onTouchMove,  { passive: true });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove",  onTouchMove);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  }, [isMobile, drawerOpen]);

  const toggleDrawer = useCallback(() => setDrawerOpen(v => !v), []);
  const closeDrawer  = useCallback(() => setDrawerOpen(false),   []);

  useEffect(() => {
    const handler = () => setDrawerOpen(true);
    window.addEventListener("knovi:open-nav", handler);
    return () => window.removeEventListener("knovi:open-nav", handler);
  }, []);

  function toggle() {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // While an AI Learning Room is active, keep the rest of the app visible but
  // require explicit confirmation before leaving the room. This prevents an
  // accidental hamburger/top-nav tap from silently interrupting a learning run.
  function requestNavigation(to) {
    if (!isAISessionRoom || to === location.pathname) return true;
    setPendingNavigation(to);
    setExitRoomOpen(true);
    return false;
  }

  function confirmExitRoom() {
    const target = pendingNavigation;
    setExitRoomOpen(false);
    setPendingNavigation(null);
    if (target === "__logout__") {
      setLogoutOpen(true);
      return;
    }
    if (target) navigate(target);
  }

  function cancelExitRoom() {
    setExitRoomOpen(false);
    setPendingNavigation(null);
  }

  function requestLogout() {
    if (isAISessionRoom) {
      setPendingNavigation("__logout__");
      setExitRoomOpen(true);
      return;
    }
    setLogoutOpen(true);
  }

  useKeyboardShortcuts([
    ...Object.entries(NAV_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => requestNavigation(to) })),
    ...Object.entries(SETTINGS_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => requestNavigation(to) })),
    { combo: BACK_SHORTCUT.combo, run: () => requestNavigation("/app") },
    { combo: "mod+b", run: () => toggle() },
    { combo: "?",     run: () => setScOpen(true), allowInInputs: false },
  ]);

  const name = profile?.displayName || user?.displayName || "peer";

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); navigate("/login"); }
    finally { setLoggingOut(false); setLogoutOpen(false); }
  }

  function NavItem({ to, label, Icon, end, inSettingsNav }) {
    const sc = inSettingsNav ? SETTINGS_SHORTCUTS[to] : NAV_SHORTCUTS[to];
    return (
      <NavLink to={to} end={end}
        className={({ isActive }) => `dash-link ${isActive ? "active" : ""}`}
        onClick={(e) => {
          if (requestNavigation(to) === false) { e.preventDefault(); return; }
          setDrawerOpen(false);
        }}
        title={label}
      >
        <span className="dash-link-icon-wrap"><Icon /></span>
        <span className="dash-link-label">{label}</span>
        {sc && (
          <span className="dash-kbd">
            {sc.keys.map((k, i) => <kbd key={i}>{displayKey(k)}</kbd>)}
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <div className={`dash ${isMobile ? "dash--mobile" : "dash--desktop"} ${isLearn ? "dash--learn" : ""}`}>

      {/* ── Mobile ── */}
      {isMobile && !isAISessionRoom && (
        <>
          <MobileTopBar drawerOpen={drawerOpen} onHamburger={toggleDrawer} />

          <MobileHamburgerMenu
            open={drawerOpen}
            onClose={closeDrawer}
            onLogout={requestLogout}
            onNavigate={requestNavigation}
          />
        </>
      )}

      {/* ── Desktop ── */}
      {!isMobile && !isAISessionRoom && (
        <header className="desktop-topbar">
          <div className="desktop-topbar-brand">
            <LogoMark size={26} />
            <span className="desktop-topbar-name">Kno<span className="logo-accent">vi</span></span>
          </div>

          <nav className="desktop-topbar-nav">
            {DESKTOP_MAIN_NAV
              .filter(({ to }) => to !== "/app/settings")
              .map(({ to, label, Icon, end }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) => `desktop-nav-item${isActive ? " active" : ""}`}
                  onClick={(e) => { if (requestNavigation(to) === false) e.preventDefault(); }}
                  title={label}>
                  <div className="desktop-nav-icon-wrap"><Icon /></div>
                  <span>{label}</span>
                </NavLink>
              ))}
          </nav>

          <div className="desktop-topbar-right">
            <NotificationsBell className="desktop-topbar-bell notif-bell-btn" />

            <div className="desktop-nav-dropdown"
              onMouseEnter={openSettings}
              onMouseLeave={closeSettings}>
              <NavLink to="/app/settings"
                className={({ isActive }) => `desktop-nav-item${isActive ? " active" : ""}`}
                onClick={(e) => { if (requestNavigation("/app/settings") === false) e.preventDefault(); }}
                title="Settings">
                <SettingsIcon />
                <span>Settings</span>
                <ChevronDown open={desktopSettingsHover} />
              </NavLink>
              {desktopSettingsHover && (
                <div className="desktop-nav-dropdown-menu">
                  {SETTINGS_NAV.filter(s => s.to !== "/app/settings").map(({ to, label, Icon }) => (
                    <NavLink key={to} to={to}
                      className={({ isActive }) => `desktop-nav-dropdown-item${isActive ? " active" : ""}`}
                      onClick={(e) => {
                        if (requestNavigation(to) === false) { e.preventDefault(); return; }
                        setDesktopSettingsHover(false);
                      }}>
                      <Icon /><span>{label}</span>
                    </NavLink>
                  ))}
                  <button type="button"
                    className="desktop-nav-dropdown-item logout-item"
                    onClick={() => { setDesktopSettingsHover(false); requestLogout(); }}>
                    <LogoutIcon /><span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* ── Main Content ── */}
      <main
        className={`dash-main ${isMobile ? "dash-main--mobile" : "dash-main--desktop"} ${isLearn ? "dash-main--learn" : ""} ${isChat ? "dash-main--chat" : ""} ${isAISessionRoom ? "dash-main--ai-room" : ""}`}
        style={isLearn && !isMobile && !isAISessionRoom ? { marginTop: 58, padding: 0 } : isAISessionRoom ? { marginTop: 0, padding: 0 } : undefined}
      >
        <Outlet />
      </main>

      <FeedbackWidget />
      <ShortcutsModal open={scOpen} onClose={() => setScOpen(false)} />
      <ConfirmDialog
        open={exitRoomOpen}
        title="Leave the Learning Room?"
        message="You're in an active AI learning session. Do you want to leave the Learning Room and go to another page?"
        confirmText="Leave room"
        cancelText="Stay here"
        onConfirm={confirmExitRoom}
        onCancel={cancelExitRoom}
      />
      <ConfirmDialog
        open={logoutOpen}
        title="Sign out of Knovi?"
        message="You'll need to sign in again to get back to your dashboard."
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
