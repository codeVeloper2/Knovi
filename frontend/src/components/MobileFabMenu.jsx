import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PlusIcon,
  CloseIcon,
  FriendRequestsIcon,
  ProgressIcon,
  LearnIcon,
} from "./DashIcons";

/**
 * MobileFabMenu — 3-item fan arc spreading upward from the FAB button.
 *
 *   left  → Learn
 *   top   → Friend Requests  (tallest point, centre)
 *   right → Progress
 */

const FAB_ITEMS = [
  { to: "/app/learn",          label: "Learn",           Icon: LearnIcon,          pos: "left"  },
  { to: "/app/match-requests", label: "Friend Requ...",  Icon: FriendRequestsIcon, pos: "top"   },
  { to: "/app/progress",       label: "Progress",        Icon: ProgressIcon,       pos: "right" },
];

function getCurrentSection(pathname) {
  if (pathname.startsWith("/app/learn"))          return FAB_ITEMS[0];
  if (pathname.startsWith("/app/match-requests")) return FAB_ITEMS[1];
  if (pathname.startsWith("/app/progress"))       return FAB_ITEMS[2];
  return null;
}

export default function MobileFabMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const current  = getCurrentSection(location.pathname);

  // Close on route change
  useEffect(() => { setIsOpen(false); }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setIsOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const FabIcon = isOpen ? CloseIcon : (current?.Icon || PlusIcon);

  function go(to) { navigate(to); setIsOpen(false); }

  return (
    <>
      {/* Dim overlay */}
      {isOpen && (
        <div
          className="mobile-fab-overlay"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Arc menu */}
      <div
        className={`fab-diamond${isOpen ? " open" : ""}`}
        aria-hidden={!isOpen}
      >
        {FAB_ITEMS.map(item => (
          <button
            key={item.to}
            type="button"
            className={`fab-item fab-item--${item.pos}${current?.to === item.to ? " active" : ""}`}
            onClick={() => go(item.to)}
            aria-label={item.label}
            tabIndex={isOpen ? 0 : -1}
          >
            <span className="fab-item-icon"><item.Icon width={20} height={20} /></span>
            <span className="fab-item-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* FAB trigger button */}
      <button
        type="button"
        className={`mobile-fab${isOpen ? " open" : ""}${current ? " has-section" : ""}`}
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? "Close menu" : current ? current.label : "Open menu"}
        aria-expanded={isOpen}
      >
        <FabIcon width={24} height={24} />
      </button>
    </>
  );
}
