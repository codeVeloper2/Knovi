/**
 * SoloPassedPage — /app/solo/concepts/:conceptId/passed
 * Screen 5: Checkpoint Passed — What's Next?
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

export default function SoloPassedPage() {
  const { conceptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    api.soloGetLesson(conceptId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conceptId]);

  async function handleMarkComplete() {
    setMarking(true);
    try {
      await api.soloMarkComplete(conceptId);
    } catch { /* already passed */ }
    setMarking(false);
  }

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading…</div>
    </div>
  );

  if (!data) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Not found.</p></div>
    </div>
  );

  const { concept, topic, subject, conceptIndex, totalConcepts, progress } = data;
  const nextConceptIdx = conceptIndex + 1;
  const hasNext = nextConceptIdx < totalConcepts;
  const syncEligible = progress?.syncEligible && !progress?.syncCompleted;

  // Mark complete on mount
  useEffect(() => {
    if (progress?.checkpointPassed) {
      handleMarkComplete();
    }
  }, [progress?.checkpointPassed]);

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        {subject && <><Link to={`/app/solo/subjects/${subject.id}`}>{subject.name}</Link><span className="bc-sep">›</span></>}
        <Link to={`/app/solo/topics/${topic.id}`}>{topic.name}</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">Completed</span>
      </div>

      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Left — success */}
        <div className="solo-card">
          <div className="checkpoint-passed-hero">
            <div className="checkpoint-passed-icon" style={{ fontSize: 40 }}>✓</div>
            <div className="checkpoint-passed-title">Checkpoint Passed!</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{concept.name}</div>
            <div className="checkpoint-passed-sub">
              You've demonstrated a good understanding of this concept.
            </div>
          </div>

          <div style={{
            borderTop: "1px solid #1e293b", paddingTop: 24, marginTop: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
              What's Next?
            </div>

            {syncEligible && (
              <div style={{ background: "rgba(79,110,247,0.07)", border: "1px solid rgba(79,110,247,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 6 }}>
                  You're ready to Sync on this concept.
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
                  Find a partner and verify your understanding together.
                </div>
                <button
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => navigate(`/app/sync?conceptId=${conceptId}`)}
                >
                  Find a Partner →
                </button>
              </div>
            )}

            <div className="btn-row">
              {hasNext && (
                <button
                  className="btn-primary"
                  onClick={() => navigate(`/app/solo/topics/${topic.id}`)}
                >
                  Continue Learning →
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={() => navigate(`/app/solo/topics/${topic.id}`)}
              >
                Back to {topic.name}
              </button>
            </div>
          </div>
        </div>

        {/* Right — progress summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="solo-card-sm">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Progress Summary</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>Solo Learning</div>
                <div style={{ fontSize: 12, background: "rgba(34,197,94,0.1)", color: "#22c55e", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                  ✓ Passed
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>Sync Session</div>
                <div style={{ fontSize: 12, background: progress?.syncCompleted ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: progress?.syncCompleted ? "#22c55e" : "#64748b", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                  {progress?.syncCompleted ? "✓ Completed" : "Pending"}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>Concept</div>
                <div style={{ fontSize: 12, color: "#e2e8f0" }}>{conceptIndex + 1} of {totalConcepts}</div>
              </div>
            </div>
          </div>

          {/* Sync not available */}
          {!syncEligible && !progress?.syncCompleted && (
            <div className="solo-card-sm">
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Can't find anyone?</div>
              <div style={{ fontSize: 12, color: "#334155", marginBottom: 12 }}>
                No partners available right now. You can still continue learning.
              </div>
              <button className="btn-secondary" style={{ width: "100%", justifyContent: "center" }}
                onClick={() => {/* TODO: notify */ }}>
                Notify Me
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
