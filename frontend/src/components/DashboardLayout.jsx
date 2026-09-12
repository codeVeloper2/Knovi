import { useRef, useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_SHORTCUTS, SETTINGS_SHORTCUTS, BACK_SHORTCUT, displayKey } from "../shortcuts";
import { LogoMark } from "./Logo";
import ShortcutsModal from "./ShortcutsModal";
import ConfirmDialog from "./ConfirmDialog";
import NotificationsBell from "./NotificationsPanel";
import * as api from "../api";
import {
  HomeIcon, DiscoverIcon, ChatIcon, RoomsIcon, LearnIcon,
  ProgressIcon, SettingsIcon, SearchIcon, MenuIcon, LogoutIcon,
  ChevronLeft, ChevronRight, ProfileIcon, SecurityIcon, BellIcon, BackIcon, MatchRequestsIcon,
} from "./DashIcons";

const LEARN_SUB = [
  { to: "/app/learn",              label: "Home",        Icon: HomeIcon,    end: true },
  { to: "/app/learn/tutorials",    label: "Tutorials",   Icon: LearnIcon },
];

const MAIN_NAV = [
  { to: "/app",                label: "Home",           Icon: HomeIcon,           end: true },
  { to: "/app/discover",       label: "Discover",       Icon: DiscoverIcon },
  { to: "/app/chat",           label: "Chat",           Icon: ChatIcon },
  { to: "/app/match-requests", label: "Friend Requests",Icon: MatchRequestsIcon },
  { to: "/app/rooms",          label: "Study Rooms",    Icon: RoomsIcon },
  { to: "/app/learn",          label: "Learn",          Icon: LearnIcon },
  { to: "/app/progress",       label: "Progress",       Icon: ProgressIcon },
];

// Desktop main nav includes Settings (it swaps to subnav when in settings)
const DESKTOP_MAIN_NAV = [
  ...MAIN_NAV,
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

// Mobile main nav does NOT include Settings (handled by dropdown below)
const MOBILE_MAIN_NAV = MAIN_NAV;

const SETTINGS_NAV = [
  { to: "/app/settings",               label: "Profile",       Icon: ProfileIcon,  end: true },
  { to: "/app/settings/subjects",      label: "Subjects",      Icon: LearnIcon },
  { to: "/app/settings/security",      label: "Security",      Icon: SecurityIcon },
  { to: "/app/settings/notifications", label: "Notifications", Icon: BellIcon },
];

const STORAGE_KEY = "peerup_sidebar_collapsed";

// Chevron for mobile dropdown
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
  const isMobileRef = useRef(window.innerWidth <= 768);

  const [collapsed,   setCollapsed]   = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [scOpen,      setScOpen]      = useState(false);
  const [logoutOpen,  setLogoutOpen]  = useState(false);
  const [loggingOut,  setLoggingOut]  = useState(false);
  // Mobile-only: settings dropdown open state
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileLearnOpen,    setMobileLearnOpen]    = useState(false);
  const [pendingMatchCount, setPendingMatchCount] = useState(0);
  const [pendingStudyCount, setPendingStudyCount] = useState(0);
  const searchRef = useRef(null);

  const inSettings = location.pathname.startsWith("/app/settings");

  // On desktop: sidebar shows settings subnav when in settings (original behaviour)
  // On mobile: main nav always shows, settings has a dropdown
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Desktop: use the original subnav swap for Settings only
  // Learn now uses dropdown on both desktop and mobile
  const inLearn = location.pathname.startsWith("/app/learn");
  const desktopNav = inSettings ? SETTINGS_NAV : DESKTOP_MAIN_NAV.filter(n => n.to !== "/app/learn");
  const mobileNav  = MOBILE_MAIN_NAV.filter(n => n.to !== "/app/learn");

  // Auto-open learn dropdown when navigating into learn
  useEffect(() => {
    if (inLearn) setMobileLearnOpen(true);
  }, [inLearn]);
  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("peerup:open-nav", handler);
    return () => window.removeEventListener("peerup:open-nav", handler);
  }, []);

  // Poll badge counts every 30s
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
    { combo: "/", run: () => searchRef.current?.focus() },
    { combo: "?", run: () => setScOpen(true), allowInInputs: false },
  ]);

  const name    = profile?.displayName || user?.displayName || "peer";
  const initial = name.trim().slice(0, 1).toUpperCase();
  const photo   = profile?.photoURL || user?.photoURL || "";

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); navigate("/login"); }
    finally { setLoggingOut(false); setLogoutOpen(false); }
  }

  // ── Shared nav link renderer ──
  function NavItem({ to, label, Icon, end, inSettingsNav }) {
    const sc    = inSettingsNav ? SETTINGS_SHORTCUTS[to] : NAV_SHORTCUTS[to];
    const badge =
      (to === "/app/match-requests" && pendingMatchCount > 0) ? pendingMatchCount :
      (to === "/app/rooms"           && pendingStudyCount > 0) ? pendingStudyCount :
      null;
    return (
      <NavLink
        to={to} end={end}
        className={({ isActive }) => `dash-link ${isActive ? "active" : ""}`}
        onClick={() => setMobileOpen(false)}
        title={label}
      >
        <span className="dash-link-icon-wrap">
          <Icon />
          {badge != null && <span className="dash-icon-badge">{badge > 9 ? "9+" : badge}</span>}
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

  return (
    <div className={`dash ${collapsed ? "dash--collapsed" : ""} ${mobileOpen ? "dash--mobile-open" : ""}`}>
      <div className="dash-overlay" onClick={() => setMobileOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className="dash-side">
        <div className="dash-side-top">
          {/* Desktop: show "Back to menu" when in settings. Mobile: always show logo. */}
          {!isMobile && inSettings ? (
            <button className="dash-back" type="button" onClick={() => navigate("/app")} title="Back to menu">
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

          {/* Close — mobile drawer */}
          <button className="dash-side-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Collapse — desktop */}
          <button className="dash-collapse" type="button" onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight width={18} height={18} /> : <ChevronLeft width={18} height={18} />}
          </button>
        </div>

        {/* Desktop: show "SETTINGS" heading when in settings */}
        {!isMobile && inSettings && <div className="dash-side-heading">Settings</div>}

        <nav className="dash-nav">
          {/* ── DESKTOP: subnav swap for Settings, dropdown for Learn ── */}
          {!isMobile && (
            <>
              {desktopNav.map(({ to, label, Icon, end }) => (
                <NavItem key={to} to={to} label={label} Icon={Icon} end={end} inSettingsNav={inSettings} />
              ))}

              {/* Learn dropdown — desktop (only shown when NOT in settings subnav) */}
              {!inSettings && (
                <>
                  <button
                    type="button"
                    className={`dash-link dash-settings-toggle ${inLearn ? "active" : ""}`}
                    onClick={() => setMobileLearnOpen(o => !o)}
                    title="Learn"
                  >
                    <span className="dash-link-icon-wrap"><LearnIcon /></span>
                    <span className="dash-link-label">Learn</span>
                    {!collapsed && <ChevronDown open={mobileLearnOpen} />}
                  </button>
                  {mobileLearnOpen && !collapsed && (
                    <div className="dash-settings-dropdown">
                      {LEARN_SUB.map(({ to, label, Icon, end }) => (
                        <NavLink
                          key={to} to={to} end={end}
                          className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                          title={label}
                        >
                          <span className="dash-link-icon-wrap"><Icon /></span>
                          <span className="dash-link-label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── MOBILE: main nav always + learn + settings dropdowns ── */}
          {isMobile && (
            <>
              {/* All main nav items except Learn (Learn gets its own dropdown) */}
              {mobileNav.filter(n => n.to !== "/app/learn").map(({ to, label, Icon, end }) => (
                <NavItem key={to} to={to} label={label} Icon={Icon} end={end} inSettingsNav={false} />
              ))}

              {/* Learn dropdown trigger */}
              <button
                type="button"
                className={`dash-link dash-settings-toggle ${inLearn ? "active" : ""}`}
                onClick={() => setMobileLearnOpen(o => !o)}
                title="Learn"
              >
                <span className="dash-link-icon-wrap"><LearnIcon /></span>
                <span className="dash-link-label">Learn</span>
                <ChevronDown open={mobileLearnOpen} />
              </button>

              {/* Learn sub-items: Home + Tutorials */}
              {mobileLearnOpen && (
                <div className="dash-settings-dropdown">
                  {LEARN_SUB.map(({ to, label, Icon, end }) => (
                    <NavLink
                      key={to} to={to} end={end}
                      className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                      onClick={() => setMobileOpen(false)}
                      title={label}
                    >
                      <span className="dash-link-icon-wrap"><Icon /></span>
                      <span className="dash-link-label">{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}

              {/* Settings dropdown trigger */}
              <button
                type="button"
                className={`dash-link dash-settings-toggle ${inSettings ? "active" : ""}`}
                onClick={() => setMobileSettingsOpen(o => !o)}
                title="Settings"
              >
                <span className="dash-link-icon-wrap"><SettingsIcon /></span>
                <span className="dash-link-label">Settings</span>
                <ChevronDown open={mobileSettingsOpen} />
              </button>

              {/* Settings sub-items */}
              {mobileSettingsOpen && (
                <div className="dash-settings-dropdown">
                  {SETTINGS_NAV.map(({ to, label, Icon, end }) => {
                    const sc = SETTINGS_SHORTCUTS[to];
                    return (
                      <NavLink
                        key={to} to={to} end={end}
                        className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                        onClick={() => setMobileOpen(false)}
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
                  })}
                </div>
              )}
            </>
          )}
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
          <NotificationsBell className="dash-bell notif-bell-btn" />
          <button className="dash-avatar" type="button" title={`${name} — open profile`}
            aria-label="Open your profile settings" onClick={() => navigate("/app/settings")}>
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
