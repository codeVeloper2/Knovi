import { useState } from "react";
import SettingsMobileHeader from "./SettingsMobileHeader";

const OPTIONS = [
  { key: "messages", label: "Chat messages", desc: "When someone sends you a message." },
  { key: "sessions", label: "Learning session reminders", desc: "Before a scheduled or saved study session." },
  { key: "progress", label: "Progress & badges", desc: "When you earn XP, badges, or level up." },
  { key: "emails", label: "Email updates", desc: "Occasional product news and tips." },
];

const STORAGE_KEY = "knovi_notifications";

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function SettingsNotifications() {
  const [prefs, setPrefs] = useState(() => {
    const saved = loadPrefs();
    // default everything on
    return OPTIONS.reduce((acc, o) => ({ ...acc, [o.key]: saved[o.key] ?? true }), {});
  });
  const [ok, setOk] = useState(false);

  function toggle(key) {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setOk(true);
      setTimeout(() => setOk(false), 1500);
      return next;
    });
  }

  return (
    <div className="settings-page">
      <SettingsMobileHeader title="Notifications" />
      <h1>Notifications</h1>
      <p className="settings-sub">Choose what you want to be notified about.</p>

      {ok && <div className="alert alert-ok">Preferences saved.</div>}

      <div className="settings-card">
        {OPTIONS.map((o) => (
          <div key={o.key} className="notif-row">
            <div className="notif-text">
              <strong>{o.label}</strong>
              <span>{o.desc}</span>
            </div>
            <button
              type="button"
              className={`switch ${prefs[o.key] ? "on" : ""}`}
              onClick={() => toggle(o.key)}
              role="switch"
              aria-checked={prefs[o.key]}
              aria-label={o.label}
            >
              <span className="switch-knob" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
