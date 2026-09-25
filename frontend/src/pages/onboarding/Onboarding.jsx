import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Logo from "../../components/Logo";
import { GRADES } from "../../subjects";
import * as api from "../../api";

// Learning Profile options
const STRENGTH_OPTIONS = [
  "Visual learning", "Verbal explanations", "Hands-on practice", "Pattern recognition",
  "Logical reasoning", "Creative problem-solving", "Memory retention", "Quick computation",
  "Abstract thinking", "Real-world applications"
];

const STRUGGLE_OPTIONS = [
  "Word problems", "Abstract concepts", "Multi-step problems", "Time pressure",
  "Mental math", "Reading comprehension", "Following instructions", "Concentration",
  "Test anxiety", "Expressing answers clearly"
];

const LEARNING_PREFERENCES = [
  "Step-by-step explanations", "Visual diagrams", "Real-world examples", "Practice problems",
  "Socratic questioning", "Analogies & metaphors", "Repetition & review", "Interactive exercises",
  "Video content", "Written summaries"
];

const STUCK_HELP = [
  "Another explanation", "A worked example", "Simpler explanation", "Practice questions",
  "Real-world example", "Breaking it into smaller steps", "I'm not sure yet"
];

const STEPS = [
  { key: "personal",      label: "Personal Info" },
  { key: "learning",      label: "Learning Profile" },
  { key: "privacy",       label: "Privacy" },
  { key: "agreement",     label: "Agreement" },
];

const TERMS = [
  { title: "Learn with integrity", body: "Use AI assistance to understand and grow — not to complete graded work dishonestly or bypass real learning." },
  { title: "Respect your peers", body: "Treat other students as partners. No harassment, mockery, or pressure — everyone is here to learn." },
  { title: "Keep it private", body: "Don't share others' photos, messages, or personal details outside Knovi." },
  { title: "Show up as yourself", body: "Use a real name and a photo you're comfortable with so other students can recognise you." },
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
  const [bio, setBio] = useState(profile?.bio || "");
  
  // Learning Profile state
  const [strengths, setStrengths] = useState([]);
  const [struggles, setStruggles] = useState([]);
  const [learningPreferences, setLearningPreferences] = useState([]);
  const [stuckHelp, setStuckHelp] = useState([]);
  const [personalNote, setPersonalNote] = useState("");
  
  // Privacy/agreement state
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
      
      // Save basic profile
      await completeProfile(
        {
          displayName: displayName.trim(),
          grade,
          bio: bio.trim(),
          photoURL: profile?.photoURL || user?.photoURL || "",
          isPublic,
          allowDirectMessage: allowDM,
        },
        photoFile
      );
      
      // Save learning profile separately (only if at least one field is filled)
      const hasLearningProfile = 
        strengths.length > 0 || 
        struggles.length > 0 || 
        learningPreferences.length > 0 || 
        stuckHelp.length > 0 || 
        personalNote.trim();
        
      if (hasLearningProfile) {
        await api.saveLearningProfile({
          strengths,
          struggles,
          learningPreferences,
          learningBehavior: stuckHelp,
          personalNote: personalNote.trim()
        });
      }
      
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
        <p className="wizard-hint">Complete your profile and let us know how you learn best.</p>
      </aside>

      {/* ── Panel ── */}
      <section className="wizard-main">
        <div className="wizard-card">
          {error && <div className="alert alert-error">{error}</div>}

          {step === "personal" && (
            <>
              <h2>Set up your profile</h2>
              <p className="card-subtitle">Tell us a bit about yourself so Knovi can personalise your learning experience.</p>

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
                  placeholder="What are you hoping to learn this term?" />
              </div>

              <div className="wizard-actions">
                <button className="btn btn-primary" type="button" onClick={next}>Next →</button>
              </div>
            </>
          )}

          {step === "learning" && (
            <>
              <h2>Your Learning Profile</h2>
              <p className="card-subtitle">Help Knovi understand how you learn so your AI tutor can teach you better.</p>

              <div className="field">
                <label>What are you good at?</label>
                <p className="hint" style={{ marginBottom: 8 }}>Select strengths that help you learn</p>
                <div className="chip-grid">
                  {STRENGTH_OPTIONS.map((s) => (
                    <button key={s} type="button" className={`chip ${strengths.includes(s) ? "on" : ""}`}
                      onClick={() => toggle(strengths, setStrengths, s)}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>What do you struggle with?</label>
                <p className="hint" style={{ marginBottom: 8 }}>Identifying challenges helps us support you better</p>
                <div className="chip-grid">
                  {STRUGGLE_OPTIONS.map((s) => (
                    <button key={s} type="button" className={`chip ${struggles.includes(s) ? "on" : ""}`}
                      onClick={() => toggle(struggles, setStruggles, s)}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>How do you learn faster?</label>
                <p className="hint" style={{ marginBottom: 8 }}>Choose teaching styles that work for you</p>
                <div className="chip-grid">
                  {LEARNING_PREFERENCES.map((p) => (
                    <button key={p} type="button" className={`chip ${learningPreferences.includes(p) ? "on" : ""}`}
                      onClick={() => toggle(learningPreferences, setLearningPreferences, p)}>{p}</button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>What usually helps when you're stuck?</label>
                <p className="hint" style={{ marginBottom: 8 }}>Tell us what works when you hit a roadblock</p>
                <div className="chip-grid">
                  {STUCK_HELP.map((h) => (
                    <button key={h} type="button" className={`chip ${stuckHelp.includes(h) ? "on" : ""}`}
                      onClick={() => toggle(stuckHelp, setStuckHelp, h)}>{h}</button>
                  ))}
                </div>
              </div>

              <div className="field field-full">
                <label htmlFor="lp-note">Anything else your AI tutor should know? (optional)</label>
                <textarea id="lp-note" rows={3} maxLength={500} value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  placeholder="e.g., 'I'm dyslexic and prefer shorter text' or 'I love space analogies'" />
                <p className="hint" style={{ marginTop: 4 }}>{personalNote.length}/500 characters</p>
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
                    <div className="privacy-toggle-desc">Let anyone message you directly. Turning this off means only you can start conversations.</div>
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

          {step === "agreement" && (
            <>
              <h2>Learning Agreement</h2>
              <p className="card-subtitle">One quick agreement to keep Knovi a safe, focused place to learn.</p>

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
                <span>By checking this box, you agree to use Knovi respectfully and for educational purposes only.</span>
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
