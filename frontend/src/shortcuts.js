/**
 * Central keyboard-shortcut registry.
 *
 * One source of truth used by:
 *  - the key handler (useKeyboardShortcuts)
 *  - the sidebar pills (hint shown inside each nav item)
 *  - the shortcuts help modal
 *
 * Combo formats:
 *  - "mod+d"     => Ctrl/Cmd + D (simultaneous)
 *  - "shift+k h" => Shift+K, then H (leader sequence)
 *  - "/" / "?"   => single key
 *
 * `keys` is what we display as <kbd> pills.
 *
 * Navigation uses a Shift+K leader sequence so we don't fight the browser
 * for reserved Ctrl/Cmd combos.
 */

// Leader key for sequential navigation: Shift+K, then a letter.
export const LEADER = { combo: "shift+k", keys: ["Shift", "K"], label: "Leader" };

// Main navigation shortcuts — all use the Shift+K leader sequence.
export const NAV_SHORTCUTS = {
  "/app":           { combo: "shift+k h", keys: ["Shift", "K", "H"], label: "Home" },
  "/app/discover":  { combo: "shift+k d", keys: ["Shift", "K", "D"], label: "Discover" },
  "/app/chat":      { combo: "shift+k e", keys: ["Shift", "K", "E"], label: "Chat" },
  "/app/challenge": { combo: "shift+k c", keys: ["Shift", "K", "C"], label: "Challenge" },
  "/app/learn":     { combo: "shift+k l", keys: ["Shift", "K", "L"], label: "Learn" },
  "/app/progress":  { combo: "shift+k p", keys: ["Shift", "K", "P"], label: "Progress" },
  "/app/settings":  { combo: "shift+k s", keys: ["Shift", "K", "S"], label: "Settings" },
};

// Settings sub-nav shortcuts — also under the Shift+K leader.
export const SETTINGS_SHORTCUTS = {
  "/app/settings/profile":          { combo: "shift+k 1", keys: ["Shift", "K", "1"], label: "Profile" },
  "/app/settings/learning-profile": { combo: "shift+k 2", keys: ["Shift", "K", "2"], label: "Learning Profile" },
  "/app/settings/security":         { combo: "shift+k 3", keys: ["Shift", "K", "3"], label: "Security" },
  "/app/settings/notifications":    { combo: "shift+k 4", keys: ["Shift", "K", "4"], label: "Notifications" },
};

// Back-to-menu (from settings) shortcut.
export const BACK_SHORTCUT = { combo: "shift+k m", keys: ["Shift", "K", "M"], label: "Back to menu" };

// Action shortcuts (shown in the help modal).
export const ACTION_SHORTCUTS = [
  { combo: "mod+b", keys: ["Ctrl", "B"], label: "Toggle sidebar" },
  { combo: "/",     keys: ["/"],          label: "Focus search" },
  { combo: "?",     keys: ["?"],          label: "Show keyboard shortcuts" },
];

// Grouped view for the help modal.
export const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    items: Object.values(NAV_SHORTCUTS).map(({ keys, label }) => ({ keys, label })),
  },
  {
    title: "Settings",
    items: [
      ...Object.values(SETTINGS_SHORTCUTS).map(({ keys, label }) => ({ keys, label })),
      { keys: BACK_SHORTCUT.keys, label: BACK_SHORTCUT.label },
    ],
  },
  {
    title: "Actions",
    items: ACTION_SHORTCUTS.map(({ keys, label }) => ({ keys, label })),
  },
];

/** Mac-friendly display: show ⌘ instead of Ctrl on Apple platforms. */
export function displayKey(k) {
  if (k !== "Ctrl") return k;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
  return isMac ? "⌘" : "Ctrl";
}
