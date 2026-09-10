import { useEffect } from "react";
import { SHORTCUT_GROUPS, displayKey } from "../shortcuts";

export default function ShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="sc-head">
          <h2>Keyboard Shortcuts</h2>
          <button className="sc-close" type="button" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="sc-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="sc-group">
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <span className="sc-keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i}>{displayKey(k)}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="sc-foot">
          Press <kbd>?</kbd> anytime to open this panel.
        </p>
      </div>
    </div>
  );
}
