/**
 * SoloConceptsPage — /app/solo/topics/:topicId
 * Shows all concepts for a topic with progress indicators.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "./solo.css";

export default function SoloConceptsPage() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.soloGetConcepts(topicId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [topicId]);

  if (loading) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading concepts…</div>
    </div>
  );

  if (!data) return (
    <div className="solo-shell">
      <div className="solo-empty"><div className="solo-empty-icon">⚠️</div><p>Topic not found.</p></div>
    </div>
  );

  const { topic, subject, concepts, totalConcepts, passedConcepts, progressPct } = data;

  function getConceptStatus(c) {
    if (!c.progress) return c.isLocked ? "locked" : "not_started";
    if (c.progress.syncCompleted) return "synced";
    if (c.progress.checkpointPassed) return c.progress.syncEligible ? "sync_ready" : "passed";
    if (c.progress.lessonViewedAt) return "in_progress";
    return c.isLocked ? "locked" : "not_started";
  }

  function handleConceptClick(c) {
    if (c.isLocked) return;
    const status = getConceptStatus(c);
    const prog = c.progress;
    if (!prog || !prog.lessonViewedAt) {
      navigate(`/app/solo/concepts/${c.id}/lesson`);
    } else if (!prog.checkpointPassed) {
      navigate(`/app/solo/concepts/${c.id}/checkpoint`);
    } else if (prog.stage === "notes" || !prog.explanationVerdict) {
      navigate(`/app/solo/concepts/${c.id}/notes`);
    } else if (prog.stage === "ask_ai") {
      navigate(`/app/solo/concepts/${c.id}/ask`);
    } else {
      navigate(`/app/solo/concepts/${c.id}/lesson`);
    }
  }

  return (
    <div className="solo-shell">
      <div className="solo-breadcrumb">
        <Link to="/app/solo">Learn</Link>
        <span className="bc-sep">›</span>
        {subject && <><Link to={`/app/solo/subjects/${subject.id}`}>{subject.name}</Link><span className="bc-sep">›</span></>}
        <span className="bc-current">{topic.name}</span>
      </div>

      <div className="solo-page-header">
        <div>
          <div className="solo-page-title">{topic.name}</div>
          <div className="solo-page-sub">{subject?.name}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600 }}>
            {passedConcepts}/{totalConcepts} concepts
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{progressPct}% complete</div>
        </div>
      </div>

      <div className="solo-progress-strip">
        <span>{progressPct}%</span>
        <div className="solo-progress-bar-wrap">
          <div className="solo-progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span>{passedConcepts}/{totalConcepts} passed</span>
      </div>

      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {concepts.map((c, i) => {
          const status = getConceptStatus(c);
          return (
            <div
              key={c.id}
              className={`concept-card ${status === "locked" ? "locked" : ""} ${status === "in_progress" ? "current" : ""} ${status === "passed" || status === "sync_ready" || status === "synced" ? "passed" : ""}`}
              onClick={() => handleConceptClick(c)}
              role={c.isLocked ? undefined : "button"}
              tabIndex={c.isLocked ? -1 : 0}
              onKeyDown={e => !c.isLocked && e.key === "Enter" && handleConceptClick(c)}
            >
              <div className="concept-card-num">Concept {i + 1} of {totalConcepts}</div>
              <div className="concept-card-name">{c.name}</div>
              <div className="concept-card-badges">
                {status === "locked" && <span className="badge-locked">🔒 Locked</span>}
                {status === "not_started" && <span className="badge-locked">Start</span>}
                {status === "in_progress" && <span className="badge-in-progress">In Progress</span>}
                {status === "passed" && <span className="badge-passed">✓ Checkpoint Passed</span>}
                {status === "sync_ready" && <span className="badge-sync">⚡ Ready to Sync</span>}
                {status === "synced" && <span className="badge-passed">✓ Synced</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
