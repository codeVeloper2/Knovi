import { useEffect, useRef } from "react";

/**
 * Global keyboard shortcuts.
 *
 * Combo formats:
 *   - "mod+s"      => Ctrl (Win/Linux) or Cmd (Mac) + S
 *   - "shift+k h"  => Shift+K, then H (leader sequence)
 *   - "/" / "?"    => single key
 *
 * Leader stays active until:
 *   - a follow-up key is pressed, or
 *   - Escape cancels, or
 *   - the user focuses an input (cancelled so typing is never hijacked)
 *
 * Holding Shift+K does not expire the leader — only the next key (or Esc) ends it.
 * Uses e.code so Shift still held on the second key still matches letters/digits.
 */

/** Map KeyboardEvent → normalized key token used in combo strings. */
function keyToken(e) {
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
  if (e.key === "?" || (e.shiftKey && (code === "Slash" || e.key === "/"))) {
    return "?";
  }
  if (code === "Slash" || e.key === "/") return "/";
  if (code === "Escape" || e.key === "Escape") return "escape";
  if (e.key && e.key.length === 1) return e.key.toLowerCase();
  return (e.key || "").toLowerCase();
}

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute?.("role") === "textbox") return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  const seqRef = useRef({
    activePrefix: null,
  });

  useEffect(() => {
    function clearSequence() {
      seqRef.current.activePrefix = null;
      document.body.classList.remove("knovi-leader-active");
    }

    function armSequence(prefix) {
      seqRef.current.activePrefix = prefix;
      document.body.classList.add("knovi-leader-active");
    }

    function onKeyDown(e) {
      const list = ref.current || [];
      if (!list.length) return;

      const mod = e.ctrlKey || e.metaKey;
      const token = keyToken(e);

      // Pure modifiers only — never clear leader on Shift/Ctrl alone.
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

      // ── Active leader sequence (stays until next key or Esc) ──────────────
      if (seqRef.current.activePrefix) {
        const prefix = seqRef.current.activePrefix;

        // Cancel when user starts typing in a field.
        if (typing) {
          clearSequence();
          return;
        }

        if (token === "escape") {
          clearSequence();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Holding / re-pressing Shift+K keeps leader armed (ignore repeat noise).
        if (!mod && e.shiftKey && token === "k") {
          e.preventDefault();
          e.stopPropagation();
          armSequence("shift+k");
          return;
        }

        // Ignore key-repeat for the follow-up as well (user holding a letter).
        if (e.repeat) return;

        const fullCombo = `${prefix} ${token}`;
        const match = list.find((s) => s.combo === fullCombo);
        clearSequence();

        if (match) {
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
        // Unmatched follow-up still ends the sequence (one-shot).
        return;
      }

      // ── While typing: only mod combos ─────────────────────────────────────
      if (typing) {
        if (!mod) return;
        const modCombo = `mod+${token}`;
        const match = list.find((s) => s.combo === modCombo);
        if (!match) return;
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

      // Ignore auto-repeat when arming leader / firing single-key shortcuts.
      if (e.repeat) return;

      // ── Simultaneous single-step match ────────────────────────────────────
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

      // ── Arm leader: Shift+K (or any multi-step first key) ─────────────────
      const leaderHit = list.some((s) => {
        const steps = s.combo.trim().split(/\s+/);
        if (steps.length < 2) return false;
        const first = steps[0];
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

    // If focus moves into an input while leader is armed, cancel.
    function onFocusIn(e) {
      if (seqRef.current.activePrefix && isTypingTarget(e.target)) {
        clearSequence();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("focusin", onFocusIn, true);
      clearSequence();
    };
  }, []);
}
