import { useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { SKILL_LEVELS, SUBJECTS } from "../../../subjects";
import SettingsMobileHeader from "./SettingsMobileHeader";

const LANGUAGES = ["English", "Spanish", "French", "Arabic", "Mandarin", "Hindi", "Portuguese", "Other"];

export default function SettingsPeerLearning() {
  const { profile, completeProfile, mapError } = useAuth();
  const toast = useToast();
  const [goodAt, setGoodAt] = useState(profile?.subjectsGoodAt || []);
  const [needHelp, setNeedHelp] = useState(profile?.subjectsNeedHelp || []);
  const [skillLevel, setSkillLevel] = useState(profile?.skillLevel || "Intermediate");
  const [language, setLanguage] = useState(profile?.language || "");
  const [busy, setBusy] = useState(false);

  function toggle(list, setList, v) {
    setList(list.includes(v) ? list.filter((i) => i !== v) : [...list, v]);
  }

  // Two lists are equal if they hold the same items, regardless of order —
  // so toggling a subject off then back on doesn't count as a change.
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((x) => setB.has(x));
  }

  // Saved baseline → the Save button stays disabled until something differs.
  const dirty =
    !sameSet(goodAt, profile?.subjectsGoodAt || []) ||
    !sameSet(needHelp, profile?.subjectsNeedHelp || []) ||
    skillLevel !== (profile?.skillLevel || "Intermediate") ||
    language !== (profile?.language || "");

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await completeProfile({
        displayName: profile?.displayName || "",
        grade: profile?.grade || "",
        subjectsGoodAt: goodAt,
        subjectsNeedHelp: needHelp,
        skillLevel,
        language,
        bio: profile?.bio || "",
        photoURL: profile?.photoURL || "",
      }, null);
      toast.success("Peer learning preferences updated!");
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <SettingsMobileHeader title="Peer Learning" />
      <h1>Peer Learning</h1>
      <p className="settings-sub">Manage your peer matching preferences to connect with classmates for study sessions.</p>

      <form onSubmit={save} className="settings-card">
        <div className="field">
          <label>Subjects I can help others with</label>
          <p className="hint" style={{ marginBottom: 8 }}>What subjects are you confident teaching to peers?</p>
          <div className="chip-grid">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" className={`chip ${goodAt.includes(s) ? "on" : ""}`}
                onClick={() => toggle(goodAt, setGoodAt, s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Subjects I need help with</label>
          <p className="hint" style={{ marginBottom: 8 }}>What subjects would you like peer support in?</p>
          <div className="chip-grid">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" className={`chip ${needHelp.includes(s) ? "on" : ""}`}
                onClick={() => toggle(needHelp, setNeedHelp, s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="sk">Overall skill level</label>
            <select id="sk" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
              {SKILL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lang">Preferred language</label>
            <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Select language</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy || !dirty} style={{ width: "auto", minWidth: 160 }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="settings-card" style={{ marginTop: 24, background: "rgba(79, 110, 247, 0.05)", border: "1px solid rgba(79, 110, 247, 0.2)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
          <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>💡</span>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 6px", color: "#e2e8f0" }}>
              About Peer Learning
            </h3>
            <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "#94a3b8", margin: 0 }}>
              These preferences help match you with classmates in the <strong>Discover</strong> tab. They're separate from your AI Learning Profile, which personalizes how PeerUP's AI tutor teaches you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
