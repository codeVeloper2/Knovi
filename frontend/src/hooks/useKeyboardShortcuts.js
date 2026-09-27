import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts.
 *
 * Each shortcut: { combo, run, prevent?, allowInInputs? }
 *   - "mod+s"      => Ctrl (Win/Linux) or Cmd (Mac) + S
 *   - "shift+k"    => Shift + K (leader / prefix)
 *   - "shift+k h"  => Shift+K, then H within the timeout window
 *   - "/"          => single key
 *   - "?"          => shift+/ (we normalize to "?")
 *
 * Sequence combos (space-separated steps) use a short leader timeout
 * after the first step is matched.
 *
 * To beat the browser's own shortcuts (save, bookmark, etc.) we listen in the
 * CAPTURE phase and call preventDefault + stopPropagation on a match.
 *
 * NOTE: A few combos are reserved by the browser/OS and reach the page too
 * late or not at all (Ctrl+T, Ctrl+W, Ctrl+N, Ctrl+Tab). Those can't be
 * overridden by any web page — we avoid using them.
 */

const SEQUENCE_TIMEOUT_MS = 1200;

function eventMatchesStep(e, step) {
  const parts = step.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  let needsMod = false;
  let needsShift = false;
  let key = "";
  for (const p of parts) {
    if (p === "mod" || p === "ctrl" || p === "cmd" || p === "meta") needsMod = true;
    else if (p === "shift") needsShift = true;
    else key = p;
  }

  const mod = e.ctrlKey || e.metaKey;
  let pressed = e.key.toLowerCase();
  if (e.key === "?") pressed = "?";

  if (needsMod !== !!mod) return false;
  if (needsShift && !e.shiftKey) return false;
  return pressed === key;
}

export function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  const seqRef = useRef({
    activePrefix: null, // e.g. "shift+k"
    timer: null,
  });

  useEffect(() => {
    function isTyping(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function clearSequence() {
      if (seqRef.current.timer) {
        clearTimeout(seqRef.current.timer);
        seqRef.current.timer = null;
      }
      seqRef.current.activePrefix = null;
    }

    function onKeyDown(e) {
      const list = ref.current || [];
      const mod = e.ctrlKey || e.metaKey;
      let key = e.key.toLowerCase();
      if (e.key === "?") key = "?";

      // Ignore pure modifier keydowns.
      if (key === "shift" || key === "control" || key === "meta" || key === "alt") return;

      // ── Active sequence: wait for the second key ──────────────────────────
      if (seqRef.current.activePrefix) {
        const prefix = seqRef.current.activePrefix;
        if (e.key === "Escape") {
          clearSequence();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Follow-up is a bare letter (shift may still be held from the leader).
        const fullCombo = `${prefix} ${key}`;
        const match = list.find((s) => s.combo === fullCombo);
        clearSequence();

        if (match) {
          if (!match.allowInInputs && isTyping(e.target)) return;
          if (match.prevent !== false) {
            e.preventDefault();
            e.stopPropagation();
          }
          match.run(e);
        }
        return;
      }

      // ── Simultaneous (single-step) match ──────────────────────────────────
      const simultaneousCombo = mod
        ? `mod+${key}`
        : e.shiftKey && key.length === 1
          ? `shift+${key}`
          : key;

      const match = list.find((s) => s.combo === simultaneousCombo);

      // ── Leader prefixes: combos with "prefix rest" ────────────────────────
      if (!match) {
        const isLeader = list.some((s) => {
          const steps = s.combo.split(/\s+/);
          return steps.length >= 2 && eventMatchesStep(e, steps[0]);
        });
        if (isLeader) {
          let prefix;
          if (mod) prefix = `mod+${key}`;
          else if (e.shiftKey) prefix = `shift+${key}`;
          else prefix = key;

          e.preventDefault();
          e.stopPropagation();

          clearSequence();
          seqRef.current.activePrefix = prefix;
          seqRef.current.timer = setTimeout(clearSequence, SEQUENCE_TIMEOUT_MS);
          return;
        }
      }

      if (!match) return;

      const isModCombo =
        match.combo.includes("mod+") ||
        match.combo.startsWith("shift+") ||
        match.combo.includes(" ");
      if (!isModCombo && !match.allowInInputs && isTyping(e.target)) return;

      if (match.prevent !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
      match.run(e);
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      clearSequence();
    };
  }, []);
}
