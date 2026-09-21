import { NavLink, useLocation } from "react-router-dom";
import { HomeIcon, DiscoverIcon, LearnIcon, SettingsIcon } from "./DashIcons";

/** Mobile primary navigation: Home | Discover | FAB | Learn | Settings.
 * Chat and Progress intentionally live inside the FAB menu. */
export default function MobileBottomNav() {
  const location = useLocation();
  const settingsActive = location.pathname.startsWith("/app/settings");
  const learnActive = location.pathname.startsWith("/app/learn");

  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <NavLink to="/app" end className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`} aria-label="Home">
        <HomeIcon width={21} height={21} />
        <span className="mobile-nav-label">Home</span>
      </NavLink>

      <NavLink to="/app/discover" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`} aria-label="Discover">
        <DiscoverIcon width={21} height={21} />
        <span className="mobile-nav-label">Discover</span>
      </NavLink>

      <div className="mobile-nav-item mobile-nav-fab-placeholder" aria-hidden="true" />

      <NavLink to="/app/learn" className={`mobile-nav-item ${learnActive ? "active" : ""}`} aria-label="Learn">
        <LearnIcon width={21} height={21} />
        <span className="mobile-nav-label">Learn</span>
      </NavLink>

      <NavLink to="/app/settings" className={`mobile-nav-item ${settingsActive ? "active" : ""}`} aria-label="Settings">
        <SettingsIcon width={21} height={21} />
        <span className="mobile-nav-label">Settings</span>
      </NavLink>
    </nav>
  );
}
