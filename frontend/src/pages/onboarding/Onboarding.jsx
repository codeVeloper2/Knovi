import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Logo from "../../components/Logo";
import { GRADES, SKILL_LEVELS, SUBJECTS } from "../../subjects";

const LANGUAGES = ["English", "Spanish", "French", "Arabic", "Mandarin", "Hindi", "Portuguese", "Other"];

const STEPS = [
  { key: "personal",   label: "Personal Info" },
  { key: "subjects",   label: "Subjects" },
  { key: "privacy",    label: "Privacy" },
  { key: "agreement",  label: "Learning Agreement" },
];

const TERMS = [
  { title: "Learn with respect", body: "Treat classmates as partners, not competitors. No harassment, mockery, or pressure." },
  { title: "Honest help", body: "Explain ideas and work through problems together. Don't complete graded work for someone else." },
  { title: "Keep it private", body: "Don't share others' photos, messages, or personal details outside PeerUp." },
  { title: "Show up as yourself", body: "Use a real name and a photo you're comfortable with so peers can recognize you." },
];

export default function Onboarding() {
  const { user, profile, completeProfile, agreeToLearning, mapError } = useAuth();
  const navigate = useNavigate();

  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // form state
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || "");
  const [grade, setGrade] = useState(profile?.grade || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [goodAt, setGoodAt] = useState(profile?.subjectsGoodAt || []);
  const [needHelp, setNeedHelp] = useState(profile?.subjectsNeedHelp || []);
  const [skillLevel, setSkillLevel] = useState(profile?.skillLevel || "Intermediate");
  const [language, setLanguage] = useState(profile?.language || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [accepted, setAccepted] = useState(profile?.agreedToLearningAgreement || false);
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? true);
  const [allowDM, setAllowDM] = useState(profile?.allowDirectMessage ?? true);

  const preview = useMemo(() => {
    if (photoFile) return URL.createObjectURL(photoFile);
    return profile?.photoURL || user?.photoURL || "";
  }, [photoFile, profile?.photoURL, user?.photoURL]);

  const step = STEPS[stepIdx].key;

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((i) => i !== value) : [...list, value]);
  }

  function next() {
    setError("");
    if (step === "personal") {
      if (!displayName.trim()) return setError("Please add your name so classmates know who you are.");
      if (!grade) return setError("Choose your grade / year.");
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    setError("");
    if (!accepted) return setError("Please accept the learning agreement to continue.");
    setBusy(true);
    try {
      // Accept the agreement first (profile update requires it server-side).
      if (!profile?.agreedToLearningAgreement) {
        await agreeToLearning();
      }
      await completeProfile(
        {
          displayName: displayName.trim(),
          grade,
          subjectsGoodAt: goodAt,
          subjectsNeedHelp: needHelp,
          skillLevel,
          language,
          bio: bio.trim(),
          photoURL: profile?.photoURL || user?.photoURL || "",
          isPublic,
          allowDirectMessage: allowDM,
        },
        photoFile
      );
      navigate("/app");
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      {/* ── Sidebar stepper ── */}
      <aside className="wizard-side">
        <Logo size={32} />
        <ul className="stepper">
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              className={`step ${i === stepIdx ? "active" : ""} ${i < stepIdx ? "done" : ""}`}
            >
              <span className="step-dot">{i < stepIdx ? "✓" : i + 1}</span>
              <span className="step-label">{s.label}</span>
            </li>
          ))}
        </ul>
        <p className="wizard-hint">Complete your profile so we can match you with the right study partners.</p>
      </aside>

      {/* ── Panel ── */}
      <section className="wizard-main">
        <div className="wizard-card">
          {error && <div className="alert alert-error">{error}</div>}

          {step === "personal" && (
            <>
              <h2>Complete Your Profile</h2>
              <p className="card-subtitle">Tell us a bit about yourself so we can match you with the right study partners.</p>

              <div className="photo-row">
                {preview ? (
                  <img className="avatar" src={preview} alt="Profile preview" />
                ) : (
                  <div className="avatar">{(displayName || "P").slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <label htmlFor="photo" className="btn-social" style={{ width: "auto", display: "inline-flex" }}>
                    Upload photo
                  </label>
                  <input id="photo" type="file" accept="image/*" hidden
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                  <p className="hint" style={{ marginTop: 8 }}>A clear face photo works best. Optional.</p>
                </div>
              </div>

              <div className="field">
                <label htmlFor="name">Display name</label>
                <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Johnson" required />
              </div>
              <div className="field">
                <label htmlFor="grade">Grade / Year</label>
                <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)} required>
                  <option value="">Select your grade</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bio">Bio (optional)</label>
                <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="What are you hoping to learn or teach this term?" />
              </div>

              <div className="wizard-actions">
                <button className="btn btn-primary" type="button" onClick={next}>Next →</button>
              </div>
            </>
          )}

          {step === "subjects" && (
            <>
              <h2>Subjects &amp; Availability</h2>
              <p className="card-subtitle">Let others know what you can teach and what you need help with.</p>

              <div className="field">
                <label>Subjects I can teach</label>
                <div className="chip-grid">
                  {SUBJECTS.map((s) => (
                    <button key={s} type="button" className={`chip ${goodAt.includes(s) ? "on" : ""}`}
                      onClick={() => toggle(goodAt, setGoodAt, s)}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Subjects I need help with</label>
                <div className="chip-grid">
                  {SUBJECTS.map((s) => (
                    <button key={s} type="button" className={`chip ${needHelp.includes(s) ? "on" : ""}`}
                      onClick={() => toggle(needHelp, setNeedHelp, s)}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor="skill">Overall skill level</label>
                <select id="skill" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
                  {SKILL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="field">
                <label htmlFor="language">Language</label>
                <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">Select language</option>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="wizard-actions">
                <button className="btn-ghost" type="button" onClick={back}>← Back</button>
                <button className="btn btn-primary" type="button" onClick={next}>Next →</button>
              </div>
            </>
          )}

          {step === "privacy" && (
            <>
              <h2>Privacy Settings</h2>
              <p className="card-subtitle">Control how other students can interact with you.</p>

              <div className="privacy-toggle-card">
                <div className="privacy-toggle-info">
                  <span className="privacy-toggle-icon">👁️</span>
                  <div>
                    <div className="privacy-toggle-title">Show my profile publicly</div>
                    <div className="privacy-toggle-desc">Let other students find and view your profile in the Discover tab</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`privacy-toggle ${isPublic ? "on" : ""}`}
                  onClick={() => setIsPublic(v => !v)}
                  aria-pressed={isPublic}
                >
                  <span className="privacy-toggle-knob" />
                </button>
              </div>

              <div className="privacy-toggle-card">
                <div className="privacy-toggle-info">
                  <span className="privacy-toggle-icon">💬</span>
                  <div>
                    <div className="privacy-toggle-title">Allow direct messages</div>
                    <div className="privacy-toggle-desc">Let anyone message you directly without sending a friend request first. Turning this off means they must send a friend request before chatting.</div>
                  </div>
                </div>
                <button
                  type="button"
                  className={`privacy-toggle ${allowDM ? "on" : ""}`}
                  onClick={() => setAllowDM(v => !v)}
                  aria-pressed={allowDM}
                >
                  <span className="privacy-toggle-knob" />
                </button>
              </div>

              <div className="wizard-actions">
                <button className="btn-ghost" type="button" onClick={back}>← Back</button>
                <button className="btn btn-primary" type="button" onClick={next}>Next →</button>
              </div>
            </>
          )}

          {step === "agreement" && (            <>
              <h2>Learning Agreement</h2>
              <p className="card-subtitle">One quick agreement to keep PeerUp a safe place to study.</p>

              <div className="agreement">
                {TERMS.map((t) => (
                  <div key={t.title} style={{ marginBottom: 14 }}>
                    <strong>{t.title}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>{t.body}</p>
                  </div>
                ))}
              </div>

              <label className="check">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>By checking this box, you agree to use PeerUp for learning only. Our platform is for educational purposes and not for anything inappropriate.</span>
              </label>

              <div className="wizard-actions">
                <button className="btn-ghost" type="button" onClick={back} disabled={busy}>← Back</button>
                <button className="btn btn-primary" type="button" onClick={finish} disabled={busy}>
                  {busy ? "Finishing…" : "Finish →"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
