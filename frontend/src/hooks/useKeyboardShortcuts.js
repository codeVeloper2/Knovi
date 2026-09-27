import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts.
 *
 * Combo formats:
 *   - "mod+s"      => Ctrl (Win/Linux) or Cmd (Mac) + S
 *   - "shift+k h"  => Shift+K, then H within the timeout window (leader sequence)
 *   - "/" / "?"    => single key
 *
 * Uses e.code (KeyH, Digit1, …) so the follow-up key still matches when Shift
 * is still held (e.key would be "!" for Shift+1, "H" vs layout quirks, etc.).
 *
 * Listens in the capture phase so we can preventDefault before the browser.
 */

const SEQUENCE_TIMEOUT_MS = 2000;

/** Map KeyboardEvent → normalized key token used in combo strings. */
function keyToken(e) {
  // Prefer physical code so Shift does not change the letter/digit identity.
  const code = e.code || "";
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase(); // KeyH → h
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5); // Digit1 → 1
  }
  if (code.startsWith("Numpad") && code.length === 7 && /\d/.test(code.slice(6))) {
    return code.slice(6);
  }
  // Punctuation / specials
  if (e.key === "?" || (e.shiftKey && (code === "Slash" || e.key === "/"))) {
    return "?";
  }
  if (code === "Slash" || e.key === "/") return "/";
  if (code === "Escape" || e.key === "Escape") return "escape";

  // Fallback
  if (e.key && e.key.length === 1) return e.key.toLowerCase();
  return (e.key || "").toLowerCase();
}

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Also treat role=textbox and designMode bodies as typing.
  if (el.getAttribute?.("role") === "textbox") return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  const seqRef = useRef({
    activePrefix: null,
    timer: null,
  });

  useEffect(() => {
    function clearSequence() {
      if (seqRef.current.timer) {
        clearTimeout(seqRef.current.timer);
        seqRef.current.timer = null;
      }
      seqRef.current.activePrefix = null;
      document.body.classList.remove("knovi-leader-active");
    }

    function armSequence(prefix) {
      clearSequence();
      seqRef.current.activePrefix = prefix;
      document.body.classList.add("knovi-leader-active");
      seqRef.current.timer = setTimeout(clearSequence, SEQUENCE_TIMEOUT_MS);
    }

    function onKeyDown(e) {
      // Ignore auto-repeat (holding a key).
      if (e.repeat) return;

      const list = ref.current || [];
      if (!list.length) return;

      const mod = e.ctrlKey || e.metaKey;
      const token = keyToken(e);

      // Pure modifiers only.
      if (
        token === "shift" ||
        token === "control" ||
        token === "meta" ||
        token === "alt" ||
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Meta" ||
        e.key === "Alt"
      ) {
        return;
      }

      const typing = isTypingTarget(e.target);

      // ── Active leader sequence ────────────────────────────────────────────
      if (seqRef.current.activePrefix) {
        const prefix = seqRef.current.activePrefix;

        if (token === "escape") {
          clearSequence();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Re-pressing the leader key restarts the window.
        if (!mod && e.shiftKey && token === "k") {
          e.preventDefault();
          e.stopPropagation();
          armSequence("shift+k");
          return;
        }

        const fullCombo = `${prefix} ${token}`;
        const match = list.find((s) => s.combo === fullCombo);
        clearSequence();

        if (match) {
          // Allow sequence completion even in inputs only if opted in.
          if (typing && !match.allowInInputs) {
            return;
          }
          if (match.prevent !== false) {
            e.preventDefault();
            e.stopPropagation();
          }
          try {
            match.run(e);
          } catch (err) {
            console.error("[shortcuts]", err);
          }
        }
        return;
      }

      // ── While typing: only allow explicit mod-combos / allowInInputs ──────
      // Leader (Shift+K) must not fire inside inputs.
      if (typing) {
        const modCombo = mod ? `mod+${token}` : null;
        if (modCombo) {
          const match = list.find((s) => s.combo === modCombo);
          if (match && (match.allowInInputs || true)) {
            // Still allow mod shortcuts in inputs (e.g. future save).
            if (match.prevent !== false) {
              e.preventDefault();
              e.stopPropagation();
            }
            try {
              match.run(e);
            } catch (err) {
              console.error("[shortcuts]", err);
            }
            return;
          }
        }
        // "?" and "/" while typing → ignore
        return;
      }

      // ── Simultaneous single-step match ────────────────────────────────────
      // "?" is always the token "?", even though Shift is held.
      let simultaneousCombo;
      if (mod) {
        simultaneousCombo = `mod+${token}`;
      } else if (token === "?" || token === "/") {
        simultaneousCombo = token;
      } else if (e.shiftKey && token.length === 1) {
        simultaneousCombo = `shift+${token}`;
      } else {
        simultaneousCombo = token;
      }

      const direct = list.find((s) => s.combo === simultaneousCombo);
      if (direct) {
        if (direct.prevent !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          direct.run(e);
        } catch (err) {
          console.error("[shortcuts]", err);
        }
        return;
      }

      // ── Leader: any multi-step combo whose first step matches this event ──
      const leaderHit = list.some((s) => {
        const steps = s.combo.trim().split(/\s+/);
        if (steps.length < 2) return false;
        const first = steps[0]; // e.g. "shift+k"
        if (first === "shift+k") {
          return !mod && e.shiftKey && token === "k";
        }
        if (first.startsWith("mod+")) {
          return mod && token === first.slice(4);
        }
        return token === first;
      });

      if (leaderHit) {
        let prefix;
        if (mod) prefix = `mod+${token}`;
        else if (e.shiftKey) prefix = `shift+${token}`;
        else prefix = token;

        e.preventDefault();
        e.stopPropagation();
        armSequence(prefix);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearSequence();
    };
  }, []);
}
