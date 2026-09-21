import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PlusIcon, CloseIcon, ProgressIcon, ChatIcon, ChallengeIcon } from "./DashIcons";

const FAB_ITEMS = [
  { to: "/app/progress", label: "Progress", Icon: ProgressIcon, pos: "left" },
  { to: "/app/challenge", label: "Challenge", Icon: ChallengeIcon, pos: "top" },
  { to: "/app/chat", label: "Chat", Icon: ChatIcon, pos: "right" },
];

function getCurrent(pathname) {
  return FAB_ITEMS.find(item => pathname.startsWith(item.to)) || null;
}

export default function MobileFabMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const current = getCurrent(location.pathname);

  useEffect(() => setIsOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = e => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const FabIcon = isOpen ? CloseIcon : PlusIcon;
  const go = to => { navigate(to); setIsOpen(false); };

  return (
    <>
      {isOpen && <div className="mobile-fab-overlay" onClick={() => setIsOpen(false)} aria-hidden="true" />}
      <div className={`fab-diamond fab-diamond--three${isOpen ? " open" : ""}`} aria-hidden={!isOpen}>
        {FAB_ITEMS.map(item => (
          <button key={item.to} type="button" className={`fab-item fab-item--${item.pos}${current?.to === item.to ? " active" : ""}`} onClick={() => go(item.to)} aria-label={item.label} tabIndex={isOpen ? 0 : -1}>
            <span className="fab-item-icon"><item.Icon width={20} height={20} /></span>
            <span className="fab-item-label">{item.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className={`mobile-fab${isOpen ? " open" : ""}${current ? " has-section" : ""}`} onClick={() => setIsOpen(v => !v)} aria-label={isOpen ? "Close menu" : "Open quick menu"} aria-expanded={isOpen}>
        <FabIcon width={24} height={24} />
      </button>
    </>
  );
}
