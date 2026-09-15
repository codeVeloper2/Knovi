/**
 * SoloLessonPage — /app/solo/concepts/:conceptId/lesson
 * Screen 1: AI Lesson — teaches the concept.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

function StepTabs({ current }) {
  const steps = [
    { key: "lesson", label: "Lesson" },
    { key: "checkpoint", label: "Check" },
    { key: "notes", label: "Notes" },
    { key: "ask", label: "Question" },
  ];
  const order = steps.map(s => s.key);
  const currentIdx = order.indexOf(current);
  return (
    <div className="solo-tabs">
      {steps.map((s, i) => (
        <div
          key={s.key}
          className={`solo-tab ${s.key === current ? "active" : ""} ${i < currentIdx ? "done" : ""}`}
        >
          {i < currentIdx && <span className="solo-tab-check">✓</span>}
          {s.label}
        </div>
      ))}
    </div>
  );
}

export default function SoloLessonPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.soloGetLesson(conceptId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conceptId]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading lesson…</div>
    </div>
  );

  if (!data) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Lesson not found.</p></div>
    </div>
  );

  const { concept, topic, subject, misconceptions, conceptIndex, totalConcepts, progress } = data;
  const pct = Math.round(((conceptIndex) / totalConcepts) * 100);

  // Detect if this is a formula-style concept (physics-like) by looking for F, m, a patterns
  const hasFormula = concept.explanation && (
    concept.explanation.includes("=") ||
    concept.key_points?.some(kp => kp.includes("="))
  );

  // Build a simple formula display if key_points look like equations
  const formulaKp = concept.key_points?.find(kp => kp.includes("=") && kp.length < 20);

  return (
    <div className="solo-shell">
      {/* Breadcrumb */}
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        {subject && <><Link to={`/app/solo/subjects/${subject.id}`}>{subject.name}</Link><span className="bc-sep">›</span></>}
        <Link to={`/app/solo/topics/${topic.id}`}>{topic.name}</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">Concept {conceptIndex + 1}</span>
      </div>

      {/* Progress strip */}
      <div className="solo-progress-strip">
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{conceptIndex + 1} of {totalConcepts} concepts</span>
        <div className="solo-progress-bar-wrap">
          <div className="solo-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span style={{ fontSize: 12, color: "#64748b" }}>{pct}%</span>
      </div>

      {/* Step tabs */}
      <StepTabs current="lesson" />

      {/* Content */}
      <div className="solo-content">
        {/* Main lesson panel */}
        <div className="solo-card">
          <div className="ai-badge">
            <div className="ai-badge-dot" />
            AI Learning Assistant
            <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 10 }}>Powered by Gemini</span>
          </div>

          <h1 className="lesson-heading">What is {concept.name}?</h1>
          <p className="lesson-sub">Let's break this down in simple terms.</p>

          <p className="lesson-explanation">{concept.explanation}</p>

          {/* Key quote / summary */}
          {concept.key_points && concept.key_points.length > 0 && (
            <div className="lesson-quote">
              "{concept.key_points[0]}"
            </div>
          )}

          {/* Formula block if applicable */}
          {formulaKp && (
            <>
              <div className="lesson-section-label">The Formula</div>
              <div className="lesson-formula">
                <div className="lesson-formula-eq">{formulaKp}</div>
                <div className="lesson-formula-legend">
                  {concept.key_points?.filter(kp => kp !== formulaKp && !kp.includes("=")).slice(0, 3).map((kp, i) => (
                    <span key={i}><strong>→</strong> {kp}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Key points */}
          {concept.key_points && concept.key_points.length > 1 && (
            <>
              <div className="lesson-section-label">Key Points</div>
              <ul className="lesson-keypoints">
                {concept.key_points.filter(kp => kp !== formulaKp).map((kp, i) => (
                  <li key={i}>{kp}</li>
                ))}
              </ul>
            </>
          )}

          {/* Example if available (from misconceptions as hints) */}
          {misconceptions && misconceptions.length > 0 && (
            <>
              <div className="lesson-section-label">Watch Out For</div>
              {misconceptions.slice(0, 1).map(m => (
                <div key={m.id} className="quick-tip">
                  <span className="quick-tip-icon">⚠️</span>
                  <div>
                    <strong style={{ color: "#f59e0b" }}>Common misconception: </strong>
                    {m.misconception}
                    <div style={{ marginTop: 4, color: "#94a3b8" }}>{m.correction}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="btn-row">
            <button
              className="btn-primary"
              onClick={() => navigate(`/app/solo/concepts/${conceptId}/checkpoint`)}
            >
              Next: Checkpoint Questions →
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate(`/app/solo/topics/${topic.id}`)}
            >
              Skip for now
            </button>
          </div>
        </div>

        {/* Right panel: concept progress + objectives */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="solo-card-sm">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Learning Checkpoint</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>
              {concept.name}
            </div>
            <div className="sync-phase-steps">
              {[
                { key: "lesson", label: "Read the lesson" },
                { key: "checkpoint", label: "Answer checkpoint questions" },
                { key: "notes", label: "Explain in your words" },
                { key: "ask", label: "Ask any questions" },
              ].map((step, i) => {
                const stageProg = progress?.stage;
                const stageOrder = ["lesson", "checkpoint", "notes", "ask_ai", "passed"];
                const currentStageIdx = stageOrder.indexOf(stageProg || "lesson");
                const stepIdx = stageOrder.indexOf(step.key === "ask" ? "ask_ai" : step.key);
                const isDone = currentStageIdx > stepIdx;
                const isActive = step.key === "lesson";
                return (
                  <div key={step.key} className={`sync-phase-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}>
                    <div className="sync-step-num">{isDone ? "✓" : i + 1}</div>
                    <div className="sync-step-body">
                      <div className="sync-step-name" style={{ fontSize: 13 }}>{step.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Concept progress badge */}
          {progress?.checkpointPassed && (
            <div className="solo-card-sm" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>Checkpoint Passed</div>
              {progress.syncEligible && !progress.syncCompleted && (
                <button
                  className="btn-primary"
                  style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                  onClick={() => navigate(`/app/sync?conceptId=${conceptId}`)}
                >
                  Find a Partner
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
