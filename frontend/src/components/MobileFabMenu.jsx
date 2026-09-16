import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  PlusIcon,
  CloseIcon,
  FriendRequestsIcon,
  ProgressIcon,
  ChallengeIcon,
  ResourcesIcon,
  UpSkillingIcon,
} from "./DashIcons";

/**
 * MobileFabMenu — Floating Action Button with 5-item diamond menu
 *
 * Layout when open:
 *
 *      Friend Requests
 *                     UpSkilling
 *   Progress                     Resources
 *                     Challenge
 *
 * The FAB itself shows:
 *  - × when open
 *  - current section icon when user is in one of the FAB sections
 *  - + otherwise
 */

const FAB_ITEMS = [
  { to: "/app/match-requests", label: "Friend Requests", Icon: FriendRequestsIcon, pos: "top"         },
  { to: "/app/progress",       label: "Progress",        Icon: ProgressIcon,       pos: "left"        },
  { to: "/app/solo",           label: "UpSkilling",      Icon: UpSkillingIcon,     pos: "top-right"   },
  { to: "/app/challenge",      label: "Challenge",       Icon: ChallengeIcon,      pos: "bottom"      },
  { to: "/app/learn",          label: "Resources",       Icon: ResourcesIcon,      pos: "bottom-right"},
];

function getCurrentSection(pathname) {
  if (pathname.startsWith("/app/match-requests")) return FAB_ITEMS[0]; // Friend Requests
  if (pathname.startsWith("/app/progress"))       return FAB_ITEMS[1]; // Progress
  if (pathname.startsWith("/app/solo"))           return FAB_ITEMS[2]; // UpSkilling
  if (pathname.startsWith("/app/challenge"))      return FAB_ITEMS[3]; // Challenge
  if (pathname.startsWith("/app/learn"))          return FAB_ITEMS[4]; // Resources
  return null;
}

export default function MobileFabMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const current   = getCurrentSection(location.pathname);

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
        <div className="mobile-fab-overlay" onClick={() => setIsOpen(false)} aria-hidden="true" />
      )}

      {/* Diamond menu */}
      <div className={`fab-diamond ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
        {FAB_ITEMS.map((item) => {
          const isActive = current?.to === item.to;
          return (
            <button
              key={item.to}
              type="button"
              className={`fab-item fab-item--${item.pos} ${isActive ? "active" : ""}`}
              onClick={() => go(item.to)}
              aria-label={item.label}
              tabIndex={isOpen ? 0 : -1}
            >
              <span className="fab-item-icon"><item.Icon width={22} height={22} /></span>
              <span className="fab-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* FAB button */}
      <button
        type="button"
        className={`mobile-fab ${isOpen ? "open" : ""} ${current ? "has-section" : ""}`}
        onClick={() => setIsOpen(o => !o)}
        aria-label={isOpen ? "Close menu" : current ? current.label : "Open menu"}
        aria-expanded={isOpen}
      >
        <FabIcon width={24} height={24} />
      </button>
    </>
  );
}
