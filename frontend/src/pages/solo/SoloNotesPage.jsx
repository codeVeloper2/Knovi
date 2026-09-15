/**
 * SoloNotesPage — /app/solo/concepts/:conceptId/notes
 * Screen 3: Explain in your own words + AI verification.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

const STEP_TABS = [
  { key: "lesson", label: "Lesson" },
  { key: "checkpoint", label: "Check" },
  { key: "notes", label: "Notes" },
  { key: "ask", label: "Question" },
];

function StepTabs({ current }) {
  const order = STEP_TABS.map(s => s.key);
  const currentIdx = order.indexOf(current);
  return (
    <div className="solo-tabs">
      {STEP_TABS.map((s, i) => (
        <div key={s.key} className={`solo-tab ${s.key === current ? "active" : ""} ${i < currentIdx ? "done" : ""}`}>
          {i < currentIdx && <span className="solo-tab-check">✓</span>}
          {s.label}
        </div>
      ))}
    </div>
  );
}

const VERDICT_CONFIG = {
  correct: {
    label: "GOOD UNDERSTANDING",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    icon: "✓",
  },
  partial: {
    label: "PARTIAL UNDERSTANDING",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    icon: "~",
  },
  incorrect: {
    label: "NEEDS REVIEW",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    icon: "✗",
  },
};

export default function SoloNotesPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();

  const [conceptName, setConceptName] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    // Load lesson to get concept name + existing progress
    api.soloGetLesson(conceptId)
      .then(d => {
        setConceptName(d.concept.name);
        setProgress(d.progress);
        // If already has explanation, pre-fill
        if (d.progress?.explanationText) {
          setText(d.progress.explanationText);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conceptId]);

  async function handleGetFeedback() {
    if (!text.trim() || text.trim().length < 10) return;
    setSubmitting(true);
    setResult(null);
    setAiError(null);
    try {
      const res = await api.soloSubmitExplanation(conceptId, { text: text.trim() });
      if (res.success) {
        setResult(res);
        setProgress(res.progress);
      } else {
        setAiError(res.error?.message || "AI verification unavailable.");
      }
    } catch {
      setAiError("Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading…</div>
    </div>
  );

  const vc = result ? VERDICT_CONFIG[result.verdict] : null;
  const MAX = 500;

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">{conceptName}</span>
      </div>
      <StepTabs current="notes" />

      <div className="solo-content">
        {/* Main */}
        <div className="solo-card">
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Checkpoint 2 — {conceptName}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Notes</h2>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
            Explain the concept in your own words below.
          </div>

          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>Your Explanation</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
            What does {conceptName} mean in your own words?
          </div>

          <textarea
            className="solo-textarea"
            placeholder={`In my own words, ${conceptName} means…`}
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX))}
            rows={6}
          />
          <div className="solo-char-count">{text.length}/{MAX}</div>

          {/* AI error state */}
          {aiError && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginTop: 14, fontSize: 13, color: "#ef4444" }}>
              ⚠️ {aiError}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn-secondary" style={{ fontSize: 13, padding: "8px 16px" }} onClick={handleGetFeedback}>Try Again</button>
                <button className="btn-secondary" style={{ fontSize: 13, padding: "8px 16px" }} onClick={() => navigate(`/app/solo/concepts/${conceptId}/ask`)}>Continue</button>
              </div>
            </div>
          )}

          {/* AI feedback */}
          {result && vc && (
            <div className="ai-feedback-block" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: vc.bg, color: vc.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>
                  {vc.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: vc.color }}>{vc.label}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Understanding score: {result.score}/100
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>AI Feedback</h4>
              <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, margin: "0 0 12px" }}>{result.feedback}</p>

              {result.correctPoints?.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 600, marginBottom: 6 }}>✓ Correct points</div>
                  <ul className="ai-feedback-points">
                    {result.correctPoints.map((p, i) => (
                      <li key={i}><span className="ai-fp-icon ai-fp-correct">✓</span> {p}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.missingPoints?.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, margin: "10px 0 6px" }}>⚠ Missing points</div>
                  <ul className="ai-feedback-points">
                    {result.missingPoints.map((p, i) => (
                      <li key={i}><span className="ai-fp-icon ai-fp-missing">⚠</span> {p}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.incorrectPoints?.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, margin: "10px 0 6px" }}>✗ Incorrect points</div>
                  <ul className="ai-feedback-points">
                    {result.incorrectPoints.map((p, i) => (
                      <li key={i}><span className="ai-fp-icon ai-fp-wrong">✗</span> {p}</li>
                    ))}
                  </ul>
                </>
              )}

              {result.hint && (
                <div className="quick-tip" style={{ marginTop: 12 }}>
                  <span className="quick-tip-icon">💡</span>
                  <div>{result.hint}</div>
                </div>
              )}

              {result.shouldRetry && result.verdict !== "correct" && (
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 13 }}
                    onClick={() => { setResult(null); setText(""); }}
                  >
                    Review & Improve
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="btn-row">
            {!result ? (
              <>
                <button
                  className="btn-primary"
                  onClick={handleGetFeedback}
                  disabled={text.trim().length < 10 || submitting}
                >
                  {submitting ? (
                    <><div className="solo-spinner" style={{ width: 14, height: 14 }} /> Analysing…</>
                  ) : "Get AI Feedback"}
                </button>
                <button className="btn-secondary" onClick={() => navigate(`/app/solo/concepts/${conceptId}/checkpoint`)}>
                  ← Back
                </button>
              </>
            ) : (
              <button
                className="btn-primary"
                onClick={() => navigate(`/app/solo/concepts/${conceptId}/ask`)}
              >
                Next: Ask a Question →
              </button>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="solo-card-sm">
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Tips for a good explanation</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "Use your own words — don't copy the lesson",
              "Include the key relationship or formula",
              "Give a real-world example if you can",
              "Keep it simple and clear",
            ].map((t, i) => (
              <li key={i} style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 8 }}>
                <span style={{ color: "#4f6ef7" }}>→</span> {t}
              </li>
            ))}
          </ul>
          {progress?.checkpointPassed && (
            <div style={{ marginTop: 16, padding: "10px 12px", background: "rgba(34,197,94,0.08)", borderRadius: 8, fontSize: 12, color: "#22c55e" }}>
              ✓ Checkpoint already passed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
