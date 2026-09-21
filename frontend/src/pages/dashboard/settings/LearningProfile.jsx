import { useState, useEffect } from "react";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import * as api from "../../../api";
import SettingsMobileHeader from "./SettingsMobileHeader";

// Predefined options for the learning profile fields
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

const PREFERENCE_OPTIONS = [
  "Step-by-step explanations", "Visual diagrams", "Real-world examples", "Practice problems",
  "Socratic questioning", "Analogies & metaphors", "Repetition & review", "Interactive exercises",
  "Video content", "Written summaries"
];

const BEHAVIOR_OPTIONS = [
  "I ask lots of questions", "I need time to think", "I prefer working through examples",
  "I learn best by doing", "I need frequent breaks", "I like challenging problems",
  "I prefer detailed feedback", "I work better with encouragement",
  "I need to see the big picture first", "I prefer bite-sized lessons"
];

const CONFIDENCE_LABELS = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence"
};

export default function SettingsLearningProfile() {
  const { mapError } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  
  // Student-reported fields
  const [strengths, setStrengths] = useState([]);
  const [struggles, setStruggles] = useState([]);
  const [learningPreferences, setLearningPreferences] = useState([]);
  const [learningBehavior, setLearningBehavior] = useState([]);
  const [personalNote, setPersonalNote] = useState("");
  
  // AI observations (read-only)
  const [aiObservations, setAiObservations] = useState([]);
  
  // Observation filters
  const [minConfidence, setMinConfidence] = useState("low");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // Baseline for dirty check
  const [baseline, setBaseline] = useState({});

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await api.getLearningProfile();
      setStrengths(data.strengths || []);
      setStruggles(data.struggles || []);
      setLearningPreferences(data.learningPreferences || []);
      setLearningBehavior(data.learningBehavior || []);
      setPersonalNote(data.personalNote || "");
      setAiObservations(data.aiObservations || []);
      
      // Save baseline
      setBaseline({
        strengths: data.strengths || [],
        struggles: data.struggles || [],
        learningPreferences: data.learningPreferences || [],
        learningBehavior: data.learningBehavior || [],
        personalNote: data.personalNote || ""
      });
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setLoading(false);
    }
  }

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((i) => i !== value) : [...list, value]);
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((x) => setB.has(x));
  }

  const dirty =
    !sameSet(strengths, baseline.strengths || []) ||
    !sameSet(struggles, baseline.struggles || []) ||
    !sameSet(learningPreferences, baseline.learningPreferences || []) ||
    !sameSet(learningBehavior, baseline.learningBehavior || []) ||
    personalNote.trim() !== (baseline.personalNote || "").trim();

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.saveLearningProfile({
        strengths,
        struggles,
        learningPreferences,
        learningBehavior,
        personalNote: personalNote.trim()
      });
      
      // Update baseline
      setBaseline({
        strengths: data.strengths || [],
        struggles: data.struggles || [],
        learningPreferences: data.learningPreferences || [],
        learningBehavior: data.learningBehavior || [],
        personalNote: data.personalNote || ""
      });
      
      toast.success("Learning profile updated!");
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  // Filter AI observations
  const filteredObservations = aiObservations.filter(obs => {
    // Confidence filter
    const conf = obs.confidence || 0;
    if (minConfidence === "medium" && conf < 0.7) return false;
    if (minConfidence === "high" && conf < 0.85) return false;
    
    // Category filter
    if (categoryFilter !== "all" && obs.category !== categoryFilter) return false;
    
    return true;
  });

  // Get unique categories from observations
  const categories = [...new Set(aiObservations.map(obs => obs.category))].filter(Boolean);

  if (loading) {
    return (
      <div className="settings-page">
        <SettingsMobileHeader title="Learning Profile" />
        <h1>Learning Profile</h1>
        <p className="settings-sub">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <SettingsMobileHeader title="Learning Profile" />
      <h1>Learning Profile</h1>
      <p className="settings-sub">
        Help PeerUP's AI understand how you learn best. These preferences guide how the AI teaches you—separate from your peer matching preferences.
      </p>

      {/* Student-reported section */}
      <form onSubmit={save} className="settings-card">
        <div className="settings-section-header">
          <div>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Your Learning Preferences</h2>
            <p className="settings-sub" style={{ margin: "4px 0 0" }}>Tell us how you learn best.</p>
          </div>
        </div>

        <div className="field">
          <label>My strengths</label>
          <p className="hint" style={{ marginBottom: 8 }}>What types of learning come naturally to you?</p>
          <div className="chip-grid">
            {STRENGTH_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${strengths.includes(s) ? "on" : ""}`}
                onClick={() => toggle(strengths, setStrengths, s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>I struggle with</label>
          <p className="hint" style={{ marginBottom: 8 }}>What learning challenges do you face?</p>
          <div className="chip-grid">
            {STRUGGLE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${struggles.includes(s) ? "on" : ""}`}
                onClick={() => toggle(struggles, setStruggles, s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Teaching style I prefer</label>
          <p className="hint" style={{ marginBottom: 8 }}>How do you like concepts explained?</p>
          <div className="chip-grid">
            {PREFERENCE_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip ${learningPreferences.includes(p) ? "on" : ""}`}
                onClick={() => toggle(learningPreferences, setLearningPreferences, p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>How I learn</label>
          <p className="hint" style={{ marginBottom: 8 }}>Describe your learning behavior.</p>
          <div className="chip-grid">
            {BEHAVIOR_OPTIONS.map((b) => (
              <button
                key={b}
                type="button"
                className={`chip ${learningBehavior.includes(b) ? "on" : ""}`}
                onClick={() => toggle(learningBehavior, setLearningBehavior, b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="field field-full">
          <label htmlFor="lp-note">Personal note (optional)</label>
          <textarea
            id="lp-note"
            rows={4}
            maxLength={2000}
            value={personalNote}
            onChange={(e) => setPersonalNote(e.target.value)}
            placeholder="Anything else the AI should know about how you learn? (e.g., 'I'm dyslexic and prefer shorter text blocks' or 'I love space analogies')"
          />
          <p className="hint" style={{ marginTop: 4 }}>
            {personalNote.length}/2000 characters
          </p>
        </div>

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !dirty}
          style={{ width: "auto", minWidth: 160 }}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* AI Observations section */}
      <div className="settings-card" style={{ marginTop: 24 }}>
        <div className="settings-section-header">
          <div>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>AI Observations</h2>
            <p className="settings-sub" style={{ margin: "4px 0 0" }}>
              Patterns the AI has noticed from your learning sessions. These help personalize your experience.
            </p>
          </div>
        </div>

        {aiObservations.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-secondary)" }}>
            <p>No observations yet. Start an AI learning session to build your profile!</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div className="field" style={{ margin: 0, minWidth: 180, flex: 1 }}>
                <label htmlFor="conf-filter" style={{ fontSize: "0.875rem" }}>Confidence</label>
                <select
                  id="conf-filter"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(e.target.value)}
                  style={{ fontSize: "0.875rem", padding: "6px 8px" }}
                >
                  <option value="low">All observations</option>
                  <option value="medium">Medium+ confidence</option>
                  <option value="high">High confidence only</option>
                </select>
              </div>
              
              {categories.length > 1 && (
                <div className="field" style={{ margin: 0, minWidth: 180, flex: 1 }}>
                  <label htmlFor="cat-filter" style={{ fontSize: "0.875rem" }}>Category</label>
                  <select
                    id="cat-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ fontSize: "0.875rem", padding: "6px 8px" }}
                  >
                    <option value="all">All categories</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Observation list */}
            {filteredObservations.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                No observations match your filters.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredObservations.slice(0, 50).map((obs, idx) => (
                  <div key={idx} className="observation-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                      <span className="observation-category">
                        {obs.category?.replace(/_/g, " ")}
                      </span>
                      <span className={`observation-confidence conf-${getConfidenceLevel(obs.confidence)}`}>
                        {Math.round((obs.confidence || 0) * 100)}%
                      </span>
                    </div>
                    <p className="observation-text">{obs.observation}</p>
                    {obs.strategy && (
                      <p className="observation-strategy">
                        <strong>Strategy:</strong> {obs.strategy}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {obs.source && <span>Source: {obs.source}</span>}
                      {obs.created_at && (
                        <span>
                          {new Date(obs.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {filteredObservations.length > 50 && (
              <p style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                Showing 50 most recent observations
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getConfidenceLevel(conf) {
  if (conf >= 0.85) return "high";
  if (conf >= 0.7) return "medium";
  return "low";
}
