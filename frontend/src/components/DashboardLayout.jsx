import { useRef, useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_SHORTCUTS, SETTINGS_SHORTCUTS, BACK_SHORTCUT, displayKey } from "../shortcuts";
import { LogoMark } from "./Logo";
import ShortcutsModal from "./ShortcutsModal";
import ConfirmDialog from "./ConfirmDialog";
import NotificationsBell from "./NotificationsPanel";
import MobileTopBar from "./MobileTopBar";
import MobileBottomNav from "./MobileBottomNav";
import MobileFabMenu from "./MobileFabMenu";
import {
  HomeIcon, DiscoverIcon, ChatIcon, LearnIcon,
  ProgressIcon, SettingsIcon, LogoutIcon,
  ChevronRight, ProfileIcon, SecurityIcon, BellIcon,
} from "./DashIcons";

// ── Nav configuration ─────────────────────────────────────────────────────────

const MAIN_NAV = [
  { to: "/app",          label: "Home",      Icon: HomeIcon,      end: true },
  { to: "/app/discover", label: "Discover",  Icon: DiscoverIcon },
  { to: "/app/chat",     label: "Chat",      Icon: ChatIcon },
  { to: "/app/learn",    label: "Learn",     Icon: LearnIcon },
  { to: "/app/progress", label: "Progress",  Icon: ProgressIcon },
];

// Desktop nav adds Settings at the bottom
const DESKTOP_MAIN_NAV = [
  ...MAIN_NAV,
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

// Mobile nav (Settings handled by its own dropdown)
const MOBILE_MAIN_NAV = MAIN_NAV;

const SETTINGS_NAV = [
  { to: "/app/settings",                  label: "Profile",          Icon: ProfileIcon,  end: true },
  { to: "/app/settings/learning-profile", label: "Learning Profile", Icon: LearnIcon },
  { to: "/app/settings/security",         label: "Security",         Icon: SecurityIcon },
  { to: "/app/settings/notifications",    label: "Notifications",    Icon: BellIcon },
];

const STORAGE_KEY = "peerup_sidebar_collapsed";

function ChevronDown({ open }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{
        marginLeft: "auto", flexShrink: 0,
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
  const navigate  = useNavigate();
  const location  = useLocation();

  const [collapsed,          setCollapsed]          = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [mobileOpen,         setMobileOpen]         = useState(false);
  const [scOpen,             setScOpen]             = useState(false);
  const [logoutOpen,         setLogoutOpen]         = useState(false);
  const [loggingOut,         setLoggingOut]         = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [desktopSettingsHover, setDesktopSettingsHover] = useState(false);
  const settingsLeaveTimer = useRef(null);

  function openSettings()  { clearTimeout(settingsLeaveTimer.current); setDesktopSettingsHover(true);  }
  function closeSettings() { settingsLeaveTimer.current = setTimeout(() => setDesktopSettingsHover(false), 120); }

  const inSettings = location.pathname.startsWith("/app/settings");
  const isLearn = location.pathname.startsWith("/app/learn");
  const isChat = location.pathname.startsWith("/app/chat");
  const isAISessionRoom = location.pathname.startsWith("/app/learn/ai/session/");

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Desktop: subnav swap only for Settings
  const desktopNav = SETTINGS_NAV; // used when inSettings
  const mobileNav  = MOBILE_MAIN_NAV;

  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("peerup:open-nav", handler);
    return () => window.removeEventListener("peerup:open-nav", handler);
  }, []);

  function toggle() {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  useKeyboardShortcuts([
    ...Object.entries(NAV_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    ...Object.entries(SETTINGS_SHORTCUTS).map(([to, s]) => ({ combo: s.combo, run: () => navigate(to) })),
    { combo: BACK_SHORTCUT.combo, run: () => navigate("/app") },
    { combo: "mod+b", run: () => toggle() },
    { combo: "?",     run: () => setScOpen(true), allowInInputs: false },
  ]);

  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); navigate("/login"); }
    finally { setLoggingOut(false); setLogoutOpen(false); }
  }

  function NavItem({ to, label, Icon, end, inSettingsNav }) {
    const sc    = inSettingsNav ? SETTINGS_SHORTCUTS[to] : NAV_SHORTCUTS[to];
    return (
      <NavLink
        to={to} end={end}
        className={({ isActive }) => `dash-link ${isActive ? "active" : ""}`}
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
  }

  // ── Settings dropdown (desktop hover version) ──
  function DesktopSettingsDropdown() {
    return (
      <div 
        className="dash-dropdown-container"
        onMouseEnter={() => setDesktopSettingsHover(true)}
        onMouseLeave={() => setDesktopSettingsHover(false)}
      >
        <NavLink
          to="/app/settings"
          className={({ isActive }) => `dash-link ${isActive ? "active" : ""}`}
          title="Settings"
        >
          <span className="dash-link-icon-wrap"><SettingsIcon /></span>
          <span className="dash-link-label">Settings</span>
          {!collapsed && <ChevronDown open={desktopSettingsHover} />}
        </NavLink>
        {desktopSettingsHover && !collapsed && (
          <div className="dash-settings-dropdown">
            {SETTINGS_NAV.filter(s => s.to !== "/app/settings").map(({ to, label, Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                onClick={() => setDesktopSettingsHover(false)}
                title={label}
              >
                <span className="dash-link-icon-wrap"><Icon /></span>
                <span className="dash-link-label">{label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`dash ${isMobile ? "dash--mobile" : "dash--desktop"} ${isLearn ? "dash--learn" : ""}`}>
      {/* ── Mobile Navigation (shown only on mobile) ── */}
      {isMobile && (
        <>
          <MobileTopBar />
          {!isAISessionRoom && <MobileBottomNav />}
          {!isAISessionRoom && <MobileFabMenu />}
        </>
      )}

      {/* ── Desktop Top Navigation Bar (shown only on desktop) ── */}
      {!isMobile && (
        <>
          <header className="desktop-topbar">
            {/* Logo */}
            <div className="desktop-topbar-brand">
              <LogoMark size={26} />
              <span className="desktop-topbar-name">Peer<span className="logo-accent">Up</span></span>
            </div>

            {/* Main Navigation */}
            <nav className="desktop-topbar-nav">
              {DESKTOP_MAIN_NAV
                .filter(({ to }) => to !== "/app/settings")
                .map(({ to, label, Icon, end }) => {
                                return (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) => `desktop-nav-item${isActive ? " active" : ""}`}
                      title={label}
                    >
                      <div className="desktop-nav-icon-wrap">
                        <Icon />
                      </div>
                      <span>{label}</span>
                    </NavLink>
                  );
                })}
            </nav>

            {/* Right Side — Bell + Settings dropdown + Avatar (no search here) */}
            <div className="desktop-topbar-right">
              <NotificationsBell className="desktop-topbar-bell notif-bell-btn" />

              {/* Settings Dropdown */}
              <div
                className="desktop-nav-dropdown"
                onMouseEnter={openSettings}
                onMouseLeave={closeSettings}
              >
                <NavLink
                  to="/app/settings"
                  className={({ isActive }) => `desktop-nav-item${isActive ? " active" : ""}`}
                  title="Settings"
                >
                  <SettingsIcon />
                  <span>Settings</span>
                  <ChevronDown open={desktopSettingsHover} />
                </NavLink>
                {desktopSettingsHover && (
                  <div className="desktop-nav-dropdown-menu">
                    {SETTINGS_NAV.filter(s => s.to !== "/app/settings").map(({ to, label, Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) => `desktop-nav-dropdown-item${isActive ? " active" : ""}`}
                        onClick={() => setDesktopSettingsHover(false)}
                      >
                        <Icon />
                        <span>{label}</span>
                      </NavLink>
                    ))}
                    <button
                      type="button"
                      className="desktop-nav-dropdown-item logout-item"
                      onClick={() => {
                        setDesktopSettingsHover(false);
                        setLogoutOpen(true);
                      }}
                    >
                      <LogoutIcon />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Profile Avatar */}
              <button
                className="desktop-topbar-avatar"
                onClick={() => navigate("/app/settings")}
                title={name}
              >
                {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : <span>{initial}</span>}
                <span className="desktop-topbar-avatar-name">{name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.6 }}>
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
            </div>
          </header>

        </>
      )}

      {/* ── Main Content ── */}
      <main
        className={`dash-main ${isMobile ? "dash-main--mobile" : "dash-main--desktop"} ${isLearn ? "dash-main--learn" : ""} ${isChat ? "dash-main--chat" : ""}`}
        style={isLearn && !isMobile ? { marginTop: 58, padding: 0 } : undefined}
      >
        <Outlet />
      </main>

      <ShortcutsModal open={scOpen} onClose={() => setScOpen(false)} />
      <ConfirmDialog
        open={logoutOpen}
        title="Sign out of PeerUP?"
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
