import { NavLink } from "react-router-dom";
import { HomeIcon, DiscoverIcon, ChatIcon, ResourcesIcon } from "./DashIcons";

/**
 * MobileBottomNav — fixed bottom navigation bar
 * Contains: Home, Discover, [FAB placeholder], Chat, Resources
 * The center slot is reserved for the FAB which is rendered separately
 */
export default function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav">
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

      {/* Center placeholder for FAB */}
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
        to="/app/learn"
        className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
        aria-label="Resources"
      >
        <ResourcesIcon width={22} height={22} />
        <span className="mobile-nav-label">Resources</span>
      </NavLink>
    </nav>
  );
}
