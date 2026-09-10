/**
 * Central keyboard-shortcut registry.
 *
 * One source of truth used by:
 *  - the key handler (useKeyboardShortcuts)
 *  - the sidebar pills (hint shown inside each nav item)
 *  - the shortcuts help modal
 *
 * `combo` is what the handler matches ("mod+d" = Ctrl/Cmd+D).
 * `keys` is what we display as <kbd> pills.
 *
 * We avoid combos the browser/OS reserves and can't be overridden
 * (Ctrl+T/W/N/Tab). We also avoid Ctrl+R since the user has no other way to
 * reload the page — Study Rooms uses Ctrl+O instead.
 */

// Main navigation shortcuts (Ctrl/Cmd + letter) — keyed by route.
export const NAV_SHORTCUTS = {
  "/app":                  { combo: "mod+h", keys: ["Ctrl", "H"], label: "Home" },
  "/app/discover":         { combo: "mod+d", keys: ["Ctrl", "D"], label: "Discover" },
  "/app/chat":             { combo: "mod+e", keys: ["Ctrl", "E"], label: "Chat" },
  "/app/match-requests":   { combo: "mod+k", keys: ["Ctrl", "K"], label: "Match Requests" },
  "/app/rooms":            { combo: "mod+o", keys: ["Ctrl", "O"], label: "Study Rooms" },
  "/app/learn":            { combo: "mod+l", keys: ["Ctrl", "L"], label: "Learn" },
  "/app/progress":         { combo: "mod+u", keys: ["Ctrl", "U"], label: "Progress" },
  "/app/settings":         { combo: "mod+s", keys: ["Ctrl", "S"], label: "Settings" },
};

// Settings sub-nav shortcuts (Ctrl/Cmd + digit) — keyed by route.
export const SETTINGS_SHORTCUTS = {
  "/app/settings":               { combo: "mod+1", keys: ["Ctrl", "1"], label: "Profile" },
  "/app/settings/subjects":      { combo: "mod+2", keys: ["Ctrl", "2"], label: "Subjects" },
  "/app/settings/security":      { combo: "mod+3", keys: ["Ctrl", "3"], label: "Security" },
  "/app/settings/notifications": { combo: "mod+4", keys: ["Ctrl", "4"], label: "Notifications" },
};

// Back-to-menu (from settings) shortcut.
export const BACK_SHORTCUT = { combo: "mod+m", keys: ["Ctrl", "M"], label: "Back to menu" };

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
