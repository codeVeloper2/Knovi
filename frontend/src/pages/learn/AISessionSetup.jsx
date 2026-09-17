import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

const FAMILIARITY_OPTIONS = [
  { value: "new", label: "Completely new", desc: "I've never encountered this before" },
  { value: "seen_before", label: "Seen it before", desc: "I've heard of it but don't really understand" },
  { value: "know_basics", label: "Know the basics", desc: "I understand the fundamentals" },
  { value: "know_well", label: "Know it well", desc: "I'm confident with this concept" },
  { value: "need_help", label: "Need specific help", desc: "I have a particular question" },
];

const INTENT_OPTIONS = [
  { value: "teach_me", label: "Teach me", desc: "Start from the beginning" },
  { value: "already_know", label: "I already know", desc: "Just check my understanding" },
  { value: "explain_simply", label: "Explain simply", desc: "Make it easy to understand" },
  { value: "give_examples", label: "Give me examples", desc: "Show me how it works" },
  { value: "broaden", label: "Broaden my knowledge", desc: "Show me connections and applications" },
  { value: "go_deeper", label: "Go deeper", desc: "I want advanced understanding" },
  { value: "quiz_me", label: "Quiz me", desc: "Test what I know" },
  { value: "custom", label: "Custom", desc: "I'll tell you what I need" },
];

export default function AISessionSetup() {
  const { subjectId, topicId, conceptId } = useParams();
  const navigate = useNavigate();

  const [concept, setConcept] = useState(null);
  const [topic, setTopic] = useState(null);
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [familiarity, setFamiliarity] = useState("new");
  const [intent, setIntent] = useState("teach_me");
  const [studentNote, setStudentNote] = useState("");
  const [customIntentText, setCustomIntentText] = useState("");

  useEffect(() => {
    const sid = parseInt(subjectId, 10);
    const tid = parseInt(topicId, 10);
    const cid = parseInt(conceptId, 10);

    Promise.all([
      api.getSubjectById(sid),
      api.getTopicById(tid),
      api.getConceptById(cid),
    ])
      .then(([subj, top, conc]) => {
        setSubject(subj);
        setTopic(top);
        setConcept(conc);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [subjectId, topicId, conceptId]);

  const handleStart = async () => {
    if (creating) return;
    setCreating(true);
    setError("");

    try {
      const session = await api.createLearningSession(
        parseInt(subjectId, 10),
        parseInt(topicId, 10),
        parseInt(conceptId, 10),
        familiarity,
        intent,
        studentNote || null,
        customIntentText || null
      );
      navigate(`/app/learn/ai/session/${session.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="ai-session-setup">
        <div className="ai-learn-container">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  if (!concept || !topic || !subject) {
    return (
      <div className="ai-session-setup">
        <div className="ai-learn-container">
          <div className="error-banner">Concept, topic, or subject not found.</div>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to Learn Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-session-setup">
      <div className="ai-learn-container">
        <button
          className="ai-back-btn"
          onClick={() =>
            navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)
          }
        >
          ← Back
        </button>

        <header className="ai-page-header">
          <span className="ai-breadcrumb">
            {subject.name} → {topic.name}
          </span>
          <h1>{concept.name}</h1>
          {concept.explanation && (
            <p className="ai-concept-explanation">{concept.explanation}</p>
          )}
        </header>

        {error && <div className="error-banner">{error}</div>}

        <section className="ai-setup-section">
          <h2>Your Current Knowledge</h2>
          <p className="ai-setup-hint">Help your AI tutor understand where you're starting from.</p>
          <div className="ai-radio-group">
            {FAMILIARITY_OPTIONS.map((opt) => (
              <label key={opt.value} className="ai-radio-card">
                <input
                  type="radio"
                  name="familiarity"
                  value={opt.value}
                  checked={familiarity === opt.value}
                  onChange={(e) => setFamiliarity(e.target.value)}
                />
                <div className="ai-radio-content">
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="ai-setup-section">
          <h2>What Do You Want to Do?</h2>
          <p className="ai-setup-hint">How would you like your tutor to approach this?</p>
          <div className="ai-radio-group">
            {INTENT_OPTIONS.map((opt) => (
              <label key={opt.value} className="ai-radio-card">
                <input
                  type="radio"
                  name="intent"
                  value={opt.value}
                  checked={intent === opt.value}
                  onChange={(e) => setIntent(e.target.value)}
                />
                <div className="ai-radio-content">
                  <strong>{opt.label}</strong>
                  <span>{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          {intent === "custom" && (
            <textarea
              className="ai-textarea"
              placeholder="Tell your tutor exactly what you need..."
              value={customIntentText}
              onChange={(e) => setCustomIntentText(e.target.value)}
              rows={3}
            />
          )}
        </section>

        <section className="ai-setup-section">
          <h2>Anything Else? (Optional)</h2>
          <textarea
            className="ai-textarea"
            placeholder="e.g., 'I struggle with the math part' or 'I need this for an exam tomorrow'"
            value={studentNote}
            onChange={(e) => setStudentNote(e.target.value)}
            rows={3}
          />
        </section>

        <div className="ai-setup-actions">
          <button
            className="ai-btn-primary"
            onClick={handleStart}
            disabled={creating || (intent === "custom" && !customIntentText.trim())}
          >
            {creating ? "Starting..." : "Start Learning"}
          </button>
        </div>
      </div>
    </div>
  );
}
