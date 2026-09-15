import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PlusIcon,
  CloseIcon,
  LearningIcon,
  FriendRequestsIcon,
  SyncIcon,
  ProgressIcon,
  SettingsIcon,
} from "./DashIcons";

/**
 * MobileFabMenu — Floating Action Button with expandable radial menu
 * 
 * Behavior:
 * - Shows current section icon when user is in a FAB section (Learning, Sync, etc.)
 * - Shows + when user is in a non-FAB section (Home, Discover, Chat, Resources)
 * - Shows × when menu is expanded
 * - Expands to show: Learning, Friend Requests, Sync, Progress, Settings
 * - Dims the page behind when expanded
 */

// Menu items in the expandable radial menu
const FAB_MENU_ITEMS = [
  { to: "/app/solo", label: "Learning", Icon: LearningIcon },
  { to: "/app/match-requests", label: "Friend Requests", Icon: FriendRequestsIcon },
  { to: "/app/sync", label: "Sync", Icon: SyncIcon },
  { to: "/app/progress", label: "Progress", Icon: ProgressIcon },
  { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
];

export default function MobileFabMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current section based on route
  const currentSection = getCurrentSection(location.pathname);

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  function handleFabClick() {
    setIsOpen(!isOpen);
  }

  function handleMenuItemClick(to) {
    navigate(to);
    setIsOpen(false);
  }

  function handleOverlayClick() {
    setIsOpen(false);
  }

  // Determine which icon to show in the FAB
  let FabIcon = PlusIcon;
  if (isOpen) {
    FabIcon = CloseIcon;
  } else if (currentSection) {
    // Show the current section's icon
    const currentItem = FAB_MENU_ITEMS.find((item) => item.to === currentSection.to);
    if (currentItem) {
      FabIcon = currentItem.Icon;
    }
  }

  return (
    <>
      {/* Overlay — dims the page when menu is open */}
      {isOpen && (
        <div
          className="mobile-fab-overlay"
          onClick={handleOverlayClick}
          aria-hidden="true"
        />
      )}

      {/* Expandable radial menu */}
      <div className={`mobile-fab-menu ${isOpen ? "open" : ""}`}>
        {FAB_MENU_ITEMS.map((item, index) => {
          const isActive = currentSection?.to === item.to;
          return (
            <button
              key={item.to}
              type="button"
              className={`mobile-fab-menu-item ${isActive ? "active" : ""}`}
              style={{ "--item-index": index }}
              onClick={() => handleMenuItemClick(item.to)}
              aria-label={item.label}
            >
              <item.Icon width={20} height={20} />
              <span className="mobile-fab-menu-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* FAB button */}
      <button
        type="button"
        className={`mobile-fab ${isOpen ? "open" : ""} ${currentSection ? "has-section" : ""}`}
        onClick={handleFabClick}
        aria-label={isOpen ? "Close menu" : currentSection ? currentSection.label : "Open menu"}
        aria-expanded={isOpen}
      >
        <FabIcon width={24} height={24} />
      </button>
    </>
  );
}

/**
 * Determine the current section based on pathname
 * Returns { to, label } or null if not in a FAB section
 */
function getCurrentSection(pathname) {
  // Solo Learning routes
  if (pathname.startsWith("/app/solo")) {
    return { to: "/app/solo", label: "Learning" };
  }
  // Sync routes
  if (pathname.startsWith("/app/sync")) {
    return { to: "/app/sync", label: "Sync" };
  }
  // Progress
  if (pathname.startsWith("/app/progress")) {
    return { to: "/app/progress", label: "Progress" };
  }
  // Settings
  if (pathname.startsWith("/app/settings")) {
    return { to: "/app/settings", label: "Settings" };
  }
  // Friend Requests
  if (pathname.startsWith("/app/match-requests")) {
    return { to: "/app/match-requests", label: "Friend Requests" };
  }
  return null;
}
