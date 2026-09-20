import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

// Maps frontend display values to backend FAMILIARITY_OPTIONS enum values
const FAMILIARITY_OPTIONS = [
  {
    value: "new",
    icon: "🌱",
    label: "Completely new",
    desc: "Start from the very beginning",
  },
  {
    value: "seen_before",
    icon: "👀",
    label: "Seen it before",
    desc: "I've heard about this but don't really know it",
  },
  {
    value: "know_basics",
    icon: "📖",
    label: "Understand the basics",
    desc: "I know some of this but want to go deeper",
  },
  {
    value: "know_well",
    icon: "✨",
    label: "Know it well",
    desc: "I'm confident — just need practice or review",
  },
  {
    value: "need_help",
    icon: "🎯",
    label: "I need help with something specific",
    desc: "I'm stuck on a particular part of this",
  },
];

// Maps frontend intent display to backend INTENT_OPTIONS enum values
const INTENT_OPTIONS = [
  { value: "teach_me",       label: "Teach me this" },
  { value: "explain_simply", label: "Explain it simply" },
  { value: "give_examples",  label: "Give me examples" },
  { value: "go_deeper",      label: "Go deeper" },
  { value: "already_know",   label: "Test my knowledge" },
  { value: "quiz_me",        label: "Quiz me straight away" },
];

export default function AISessionSetup() {
  const { subjectId, topicId, conceptId } = useParams();
  const navigate = useNavigate();

  const [loading,    setLoading]    = useState(true);
  const [concept,    setConcept]    = useState(null);
  const [familiarity, setFamiliarity] = useState("");
  const [intent,     setIntent]     = useState("teach_me");
  const [studentNote, setStudentNote] = useState("");
  const [creating,   setCreating]   = useState(false);
  const [error,      setError]      = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  useEffect(() => {
    api.getConcept(conceptId)
      .then(con => { setConcept(con); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [conceptId]);

  async function handleStartSession() {
    if (!familiarity) return;
    setCreating(true);
    setError(null);
    try {
      const session = await api.createAISession({
        subjectId:   parseInt(subjectId, 10),
        topicId:     parseInt(topicId, 10),
        conceptId:   parseInt(conceptId, 10),
        familiarity,
        intent,
        studentNote: studentNote.trim() || null,
      });

      // The setup choices are the AI's session context. Prepare the first
      // teaching response now so the room opens directly into the conversation.
      try {
        await api.prepareAISession(session.id);
      } catch (aiErr) {
        // Keep the session usable; the room will retry preparation automatically.
        console.warn('AI session preparation deferred:', aiErr);
      }

      setSessionData(session);
      setShowWelcome(true);
    } catch (err) {
      setError(err.message || "Failed to create session. Please try again.");
      setCreating(false);
    }
  }

  function handleEnterRoom() {
    if (sessionData?.id) {
      navigate(`/app/learn/ai/session/${sessionData.id}`);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ai-learn-page">
        <div className="ai-setup-container">
          <div className="skeleton skeleton-text" style={{ width: "260px", height: "32px" }} />
          <div className="skeleton skeleton-text" style={{ width: "420px", height: "18px", marginTop: "10px" }} />
          <div className="skeleton skeleton-card" style={{ height: "380px", marginTop: "32px" }} />
        </div>
      </div>
    );
  }

  if (!concept) {
    return (
      <div className="ai-learn-page">
        <div className="ai-empty-state">
          <div className="ai-empty-icon">❌</div>
          <p className="ai-empty-text">Concept not found.</p>
          <button
            className="ai-btn-secondary"
            onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}
          >
            Back to Topic
          </button>
        </div>
      </div>
    );
  }

  // ── Session Welcome ────────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <div className="ai-learn-page">
        <div className="ai-welcome-container">
          <div className="ai-tutor-mascot-large" aria-hidden="true">
            <TutorAvatar size={120} />
          </div>
          <div className="ai-welcome-content">
            <p className="ai-welcome-label">You're learning:</p>
            <h1 className="ai-welcome-title">{concept.name}</h1>
            <p className="ai-welcome-meta">
              {concept.subjectName || ""}{concept.topicName ? ` · ${concept.topicName}` : ""}
            </p>

            <div className="ai-welcome-divider" />

            <h2 className="ai-welcome-subtitle">Your AI tutor is ready.</h2>
            <p className="ai-welcome-text">
              I'll explain this concept in a way that matches what you already know,
              then check your understanding as we go.
            </p>
            <p className="ai-welcome-text ai-welcome-note">
              Be honest with your answers — your tutor uses them to adapt how it teaches you.
            </p>

            <button
              className="ai-btn-primary ai-btn-large"
              onClick={handleEnterRoom}
              disabled={!sessionData?.id}
            >
              Enter Learning Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup Form ─────────────────────────────────────────────────────────────
  return (
    <div className="ai-learn-page">
      <button
        className="ai-back-btn"
        onClick={() => navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}
      >
        <ChevronLeftIcon /> Back
      </button>

      <div className="ai-setup-container">
        <div className="ai-setup-header">
          <h1 className="ai-setup-title">{concept.name}</h1>
          <p className="ai-setup-subtitle">{concept.explanation}</p>
          {(concept.subjectName || concept.topicName) && (
            <p className="ai-setup-meta">
              {[concept.subjectName, concept.topicName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="ai-setup-card">
          {/* Familiarity */}
          <h2 className="ai-setup-question">How familiar are you with this?</h2>
          <div className="ai-familiarity-options" role="radiogroup" aria-label="Familiarity level">
            {FAMILIARITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                role="radio"
                aria-checked={familiarity === opt.value}
                className={`ai-familiarity-btn${familiarity === opt.value ? " active" : ""}`}
                onClick={() => setFamiliarity(opt.value)}
              >
                <span className="ai-familiarity-icon" aria-hidden="true">{opt.icon}</span>
                <span>
                  <span className="ai-familiarity-label">{opt.label}</span>
                  <span className="ai-familiarity-desc">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Intent */}
          <h2 className="ai-setup-question" style={{ marginTop: "28px" }}>
            What would you like to do?
          </h2>
          <div className="ai-intent-grid">
            {INTENT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`ai-intent-chip${intent === opt.value ? " active" : ""}`}
                onClick={() => setIntent(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Student note */}
          <div className="ai-setup-additional">
            <label className="ai-setup-label" htmlFor="student-note">
              Tell your tutor anything else <span className="ai-setup-optional">(optional)</span>
            </label>
            <textarea
              id="student-note"
              className="ai-setup-textarea"
              placeholder="e.g. I understand force but not acceleration. I keep confusing velocity and speed."
              value={studentNote}
              onChange={e => setStudentNote(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="ai-setup-hint">Helps your tutor personalise the explanation</p>
          </div>

          {error && (
            <div className="ai-setup-error" role="alert">{error}</div>
          )}

          <button
            className="ai-btn-primary ai-btn-large"
            onClick={handleStartSession}
            disabled={!familiarity || creating}
            aria-busy={creating}
          >
            {creating ? "Creating session…" : "Start AI Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function TutorAvatar({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PeerUp AI Tutor"
      role="img"
    >
      <defs>
        <linearGradient id="tutorGrad" x1="150" y1="70" x2="360" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f9bff" />
          <stop offset="0.5" stopColor="#1fbaf0" />
          <stop offset="1" stopColor="#25e7c6" />
        </linearGradient>
      </defs>
      {/* U shape */}
      <path
        d="M356 96 V300 A100 100 0 0 1 156 300 V300"
        stroke="url(#tutorGrad)" strokeWidth="64" strokeLinecap="round" fill="none"
      />
      {/* Left bar */}
      <path
        d="M156 300 V150"
        stroke="url(#tutorGrad)" strokeWidth="64" strokeLinecap="round" fill="none"
      />
      {/* Upward arrowhead */}
      <path d="M156 70 L226 168 H86 Z" fill="url(#tutorGrad)" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
