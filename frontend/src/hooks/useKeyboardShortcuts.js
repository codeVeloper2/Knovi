import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts.
 *
 * Each shortcut: { combo, run, prevent?, allowInInputs? }
 *   - "mod+s"  => Ctrl (Win/Linux) or Cmd (Mac) + S
 *   - "/"      => single key
 *   - "?"      => shift+/ (we normalize to "?")
 *
 * To beat the browser's own shortcuts (save, bookmark, etc.) we listen in the
 * CAPTURE phase and call preventDefault + stopPropagation on a match.
 *
 * NOTE: A few combos are reserved by the browser/OS and reach the page too
 * late or not at all (Ctrl+T, Ctrl+W, Ctrl+N, Ctrl+Tab). Those can't be
 * overridden by any web page — we avoid using them.
 */
export function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    function isTyping(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKeyDown(e) {
      const list = ref.current || [];
      const mod = e.ctrlKey || e.metaKey;
      let key = e.key.toLowerCase();
      // Normalize "?" (shift+/) so a single-key "?" shortcut matches.
      if (e.key === "?") key = "?";

      const combo = mod ? `mod+${key}` : key;
      const match = list.find((s) => s.combo === combo);
      if (!match) return;

      // Ignore single-key shortcuts while typing (but allow modifier combos,
      // and allow any shortcut that opts in via allowInInputs).
      if (!mod && !match.allowInInputs && isTyping(e.target)) return;

      if (match.prevent !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
      match.run(e);
    }

    // Capture phase = we see the event before the browser's default handling.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
