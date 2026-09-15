import { NavLink } from "react-router-dom";
import { HomeIcon, DiscoverIcon, ChatIcon, SettingsIcon } from "./DashIcons";

/**
 * MobileBottomNav — fixed bottom navigation bar
 * Tabs: Home | Discover | [FAB placeholder] | Chat | Settings
 */
export default function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <NavLink
        to="/app"
        end
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
        aria-label="Home"
      >
        <HomeIcon width={22} height={22} />
        <span className="mobile-nav-label">Home</span>
      </NavLink>

      <NavLink
        to="/app/discover"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
        aria-label="Discover"
      >
        <DiscoverIcon width={22} height={22} />
        <span className="mobile-nav-label">Discover</span>
      </NavLink>

      {/* Centre slot — occupied by the FAB rendered separately */}
      <div className="mobile-nav-item mobile-nav-fab-placeholder" aria-hidden="true" />

      <NavLink
        to="/app/chat"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
        aria-label="Chat"
      >
        <ChatIcon width={22} height={22} />
        <span className="mobile-nav-label">Chat</span>
      </NavLink>

      <NavLink
        to="/app/settings"
        className={({ isActive }) =>
          `mobile-nav-item ${isActive || location.pathname.startsWith("/app/settings") ? "active" : ""}`
        }
        aria-label="Settings"
      >
        <SettingsIcon width={22} height={22} />
        <span className="mobile-nav-label">Settings</span>
      </NavLink>
    </nav>
  );
}
