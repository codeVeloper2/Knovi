import { useEffect, useState } from "react";
import * as api from "../../../api";
import SettingsMobileHeader from "./SettingsMobileHeader";

const OPTIONS = [
  { key: "messages", label: "Chat messages", desc: "Email when someone sends you a message." },
  { key: "sessions", label: "Learning session reminders", desc: "Email reminders for study and learning sessions." },
  { key: "progress", label: "Progress & badges", desc: "Email when you earn XP, level up, or unlock badges." },
  { key: "emails", label: "Product updates", desc: "Occasional tips and product news by email." },
];

const DEFAULTS = OPTIONS.reduce((acc, o) => ({ ...acc, [o.key]: true }), {});

export default function SettingsNotifications() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.getNotificationPrefs()
      .then((data) => {
        if (!alive) return;
        const server = data?.prefs || data || {};
        setPrefs(OPTIONS.reduce((acc, o) => ({ ...acc, [o.key]: server[o.key] ?? true }), {}));
      })
      .catch(() => {
        // Fall back to local defaults if API unavailable
        if (!alive) return;
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setError("");
    try {
      await api.updateNotificationPrefs(next);
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    } catch (err) {
      setPrefs(prefs); // revert
      setError(err.message || "Could not save preferences.");
    }
  }

  return (
    <div className="settings-page">
      <SettingsMobileHeader title="Notifications" />
      <h1>Notifications</h1>
      <p className="settings-sub">
        Choose what Knovi emails to your account address. All of these notifications are delivered by email when enabled.
      </p>

      {ok && <div className="alert alert-ok">Preferences saved.</div>}
      {error && <div className="alert alert-error">{error}</div>}

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
              onClick={() => !loading && toggle(o.key)}
              role="switch"
              aria-checked={prefs[o.key]}
              aria-label={o.label}
              disabled={loading}
            >
              <span className="switch-knob" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
