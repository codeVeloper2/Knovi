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
import * as api from "../api";
import {
  HomeIcon, DiscoverIcon, ChatIcon, LearnIcon,
  ProgressIcon, SettingsIcon, SearchIcon, MenuIcon, LogoutIcon,
  ChevronLeft, ChevronRight, ProfileIcon, SecurityIcon, BellIcon, BackIcon, MatchRequestsIcon,
  UpSkillingIcon,
} from "./DashIcons";

// ── Inline nav icons for new system ──────────────────────────────────────────

function LearningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}

function ChallengeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
      <path d="M3 22v-6h6"/>
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    </svg>
  );
}

// ── Nav configuration ─────────────────────────────────────────────────────────

// "Learning" dropdown sub-items (shown when the Learning section is expanded)
const LEARNING_SUB = [
  { to: "/app/solo",            label: "UpSkilling",   Icon: UpSkillingIcon, end: true },
  { to: "/app/challenge",       label: "Challenge",  Icon: ChallengeIcon },
  { to: "/app/learn",           label: "Resources",  Icon: LearnIcon, end: true },
];

const MAIN_NAV = [
  { to: "/app",                label: "Home",            Icon: HomeIcon,          end: true },
  { to: "/app/discover",       label: "Discover",        Icon: DiscoverIcon },
  { to: "/app/chat",           label: "Chat",            Icon: ChatIcon },
  { to: "/app/match-requests", label: "Friend Requests", Icon: MatchRequestsIcon },
  { to: "/app/solo",           label: "UpSkilling",      Icon: UpSkillingIcon },
  { to: "/app/challenge",      label: "Challenge",       Icon: ChallengeIcon },
  { to: "/app/learn",          label: "Resources",       Icon: LearnIcon },
  { to: "/app/progress",       label: "Progress",        Icon: ProgressIcon },
];

// Desktop nav adds Settings at the bottom
const DESKTOP_MAIN_NAV = [
  ...MAIN_NAV,
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

// Mobile nav (Settings handled by its own dropdown)
const MOBILE_MAIN_NAV = MAIN_NAV;

const SETTINGS_NAV = [
  { to: "/app/settings",               label: "Profile",       Icon: ProfileIcon,  end: true },
  { to: "/app/settings/subjects",      label: "Subjects",      Icon: LearnIcon },
  { to: "/app/settings/security",      label: "Security",      Icon: SecurityIcon },
  { to: "/app/settings/notifications", label: "Notifications", Icon: BellIcon },
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
  const [mobileLearningOpen, setMobileLearningOpen] = useState(false);
  const [desktopSettingsHover, setDesktopSettingsHover] = useState(false);
  const [desktopLearningHover, setDesktopLearningHover] = useState(false);
  const settingsLeaveTimer = useRef(null);
  const learningLeaveTimer = useRef(null);

  function openSettings()  { clearTimeout(settingsLeaveTimer.current); setDesktopSettingsHover(true);  }
  function closeSettings() { settingsLeaveTimer.current = setTimeout(() => setDesktopSettingsHover(false), 120); }
  function openLearning()  { clearTimeout(learningLeaveTimer.current); setDesktopLearningHover(true);  }
  function closeLearning() { learningLeaveTimer.current = setTimeout(() => setDesktopLearningHover(false), 120); }
  const [pendingMatchCount,  setPendingMatchCount]  = useState(0);
  const searchRef = useRef(null);

  const inSettings = location.pathname.startsWith("/app/settings");
  const inLearning = (
    location.pathname.startsWith("/app/solo") ||
    location.pathname.startsWith("/app/challenge") ||
    location.pathname.startsWith("/app/learn")
  );

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Desktop: subnav swap only for Settings; Learning uses dropdown
  const desktopNav = SETTINGS_NAV; // used when inSettings
  const mobileNav  = MOBILE_MAIN_NAV.filter(
    n => n.to !== "/app/learn" && n.to !== "/app/solo" && n.to !== "/app/challenge"
  );

  // Auto-open Learning dropdown when navigating into any learning route
  useEffect(() => {
    if (inLearning) setMobileLearningOpen(true);
  }, [inLearning]);

  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("peerup:open-nav", handler);
    return () => window.removeEventListener("peerup:open-nav", handler);
  }, []);

  // Poll badge counts every 30 s
  useEffect(() => {
    let active = true;
    async function fetchCounts() {
      const [matchRes] = await Promise.allSettled([
        api.getPendingRequestCount(),
      ]);
      if (!active) return;
      if (matchRes.status === "fulfilled") setPendingMatchCount(matchRes.value.count ?? 0);
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
    { combo: "/",     run: () => searchRef.current?.focus() },
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
    const badge = (to === "/app/match-requests" && pendingMatchCount > 0) ? pendingMatchCount : null;
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

  // ── Learning dropdown (shared between desktop and mobile) ──
  function LearningDropdown({ isDesktop }) {
    const isOpen = isDesktop ? desktopLearningHover : mobileLearningOpen;
    const toggleOpen = isDesktop ? undefined : (() => setMobileLearningOpen(o => !o));
    
    return (
      <div 
        key="learning-dropdown"
        className="dash-dropdown-container"
        onMouseEnter={isDesktop ? () => setDesktopLearningHover(true) : undefined}
        onMouseLeave={isDesktop ? () => setDesktopLearningHover(false) : undefined}
      >
        <button
          type="button"
          className={`dash-link dash-settings-toggle ${inLearning ? "active" : ""}`}
          onClick={toggleOpen}
          title="Learning"
        >
          <span className="dash-link-icon-wrap"><UpSkillingIcon /></span>
          <span className="dash-link-label">UpSkilling</span>
          {(!isDesktop || !collapsed) && <ChevronDown open={isOpen} />}
        </button>
        {isOpen && (!isDesktop || !collapsed) && (
          <div className="dash-settings-dropdown">
            {LEARNING_SUB.map(({ to: subTo, label: subLabel, Icon: SubIcon, end: subEnd }) => (
              <NavLink
                key={subTo} to={subTo} end={subEnd}
                className={({ isActive }) => `dash-link dash-sub-link ${isActive ? "active" : ""}`}
                onClick={() => {setMobileOpen(false); if (isDesktop) setDesktopLearningHover(false);}}
                title={subLabel}
              >
                <span className="dash-link-icon-wrap"><SubIcon /></span>
                <span className="dash-link-label">{subLabel}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
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
    <div className={`dash ${isMobile ? "dash--mobile" : "dash--desktop"}`}>
      {/* ── Mobile Navigation (shown only on mobile) ── */}
      {isMobile && (
        <>
          <MobileTopBar />
          <MobileBottomNav />
          <MobileFabMenu />
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
                .filter(({ to }) => !["/app/solo", "/app/challenge", "/app/learn", "/app/settings"].includes(to))
                .map(({ to, label, Icon, end }) => {
                  const badge = (to === "/app/match-requests" && pendingMatchCount > 0) ? pendingMatchCount : null;

                  if (to === "/app/progress") {
                    return (
                      <span key="nav-with-dropdowns" style={{ display: "contents" }}>
                        {/* Learning Dropdown */}
                        <div
                          className="desktop-nav-dropdown"
                          onMouseEnter={openLearning}
                          onMouseLeave={closeLearning}
                        >
                          <NavLink
                            to="/app/solo"
                            className={() => `desktop-nav-item ${inLearning ? "active" : ""}`}
                            title="Learning"
                          >
                            <UpSkillingIcon />
                            <span>Learn</span>
                            <ChevronDown open={desktopLearningHover} />
                          </NavLink>
                          {desktopLearningHover && (
                            <div className="desktop-nav-dropdown-menu">
                              {LEARNING_SUB.map(({ to: subTo, label: subLabel, Icon: SubIcon }) => (
                                <NavLink
                                  key={subTo}
                                  to={subTo}
                                  className={({ isActive }) => `desktop-nav-dropdown-item${isActive ? " active" : ""}`}
                                  onClick={() => setDesktopLearningHover(false)}
                                >
                                  <SubIcon />
                                  <span>{subLabel}</span>
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Progress */}
                        <NavLink
                          to={to}
                          end={end}
                          className={({ isActive }) => `desktop-nav-item${isActive ? " active" : ""}`}
                          title={label}
                        >
                          <Icon />
                          <span>{label}</span>
                        </NavLink>
                      </span>
                    );
                  }

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
                        {badge != null && <span className="desktop-nav-badge">{badge > 9 ? "9+" : badge}</span>}
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

          {/* ── Sub-bar: greeting + search ── */}
          <div className="desktop-subbar">
            <span className="desktop-subbar-greeting">
              Hi, <strong>{name}</strong> 👋
            </span>
            <div className="desktop-subbar-search">
              <SearchIcon width={16} height={16} />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search students, subjects, or topics…"
              />
            </div>
          </div>
        </>
      )}

      {/* ── Main Content ── */}
      <main className={`dash-main ${isMobile ? "dash-main--mobile" : "dash-main--desktop"}`}>
        <Outlet />
      </main>

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
