/**
 * SessionOverviewPage — /app/study-rooms/session/:sessionId
 * Shows topic details + learning journey stages + "Start Learning" button.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { STAGES, STAGE_LABELS, STAGE_ICONS, fmtDuration, estimateDuration } from "./sessionUtils";

const JOURNEY = [
  { stage: "learn",     label: "Learn",     desc: "Read the key concepts and learning objectives.", mins: 8 },
  { stage: "explain",   label: "Explain",   desc: "Explain the concept in your own words.", mins: 10 },
  { stage: "verify",    label: "AI Verify", desc: "AI checks your explanation for accuracy.", mins: 2 },
  { stage: "practice",  label: "Practice",  desc: "Solve practice questions.", mins: 10 },
  { stage: "challenge", label: "Challenge", desc: "Solve a real-world force problem.", mins: 10 },
  { stage: "check",     label: "Check",     desc: "Check your understanding.", mins: 7 },
];

export default function SessionOverviewPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getLearningSession(Number(sessionId))
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-error-card">
        <p className="ls-error-text">⚠️ {error}</p>
        <button className="ls-btn-ghost" onClick={() => navigate(-1)}>← Back</button>
      </div>
    </div>
  );

  if (!session) return (
    <div className="ls-page ls-page-centered">
      <div className="ls-loading-spinner" aria-label="Loading" />
    </div>
  );

  const topic = session.topic || {};
  const duration = fmtDuration(topic.estimatedMinutes ?? estimateDuration(topic.activitiesCount));
  const currentStage = session.currentStage || "learn";
  const stageIdx = STAGES.indexOf(currentStage);

  function handleStart() {
    navigate(`/app/study-rooms/session/${sessionId}/learn`);
  }

  return (
    <div className="ls-page">
      <div className="ls-overview-layout">
        {/* Left: topic hero */}
        <div className="ls-overview-left">
          <div className="ls-overview-hero">
            <div className="ls-overview-hero-icon">{topic.subjectIcon || "📚"}</div>
            <h1 className="ls-overview-topic-name">{topic.name}</h1>
            <div className="ls-overview-tags">
              <span className="ls-tag">{topic.subject}</span>
              {topic.difficulty && <span className="ls-tag">{topic.difficulty}</span>}
              <span className="ls-tag">⏱ {duration}</span>
            </div>
            {topic.description && <p className="ls-overview-desc">{topic.description}</p>}
            <div className="ls-overview-counts">
              <span>🎯 {topic.objectivesCount ?? 0} Objectives</span>
              <span>💡 {topic.conceptsCount ?? 0} Concepts</span>
              <span>🎓 {topic.activitiesCount ?? 0} Activities</span>
              <span>❓ {topic.questionsCount ?? 0} Questions</span>
            </div>
          </div>

          <div className="ls-overview-progress-block">
            <div className="ls-overview-progress-header">
              <span>Your Progress</span>
              <span>{stageIdx <= 0 ? 0 : Math.round((stageIdx / STAGES.length) * 100)}%</span>
            </div>
            <div className="ls-progress-bar-track">
              <div
                className="ls-progress-bar-fill"
                style={{ width: `${stageIdx <= 0 ? 0 : Math.round((stageIdx / STAGES.length) * 100)}%` }}
              />
            </div>
            <p className="ls-overview-est">Estimated time: {duration}</p>
          </div>

          <button className="ls-btn-primary ls-overview-start-btn" onClick={handleStart}>
            Start Learning →
          </button>
        </div>

        {/* Right: learning journey */}
        <div className="ls-overview-right">
          <h2 className="ls-overview-journey-title">Learning Journey</h2>
          <div className="ls-journey-list">
            {JOURNEY.map((step, i) => {
              const done = stageIdx > i;
              const active = stageIdx === i;
              return (
                <div key={step.stage} className={`ls-journey-step ${active ? "active" : ""} ${done ? "done" : ""}`}>
                  <div className="ls-journey-num">
                    {done ? "✓" : i + 1}
                  </div>
                  <div className="ls-journey-content">
                    <div className="ls-journey-header">
                      <span className="ls-journey-icon">{STAGE_ICONS[step.stage]}</span>
                      <span className="ls-journey-label">{step.label}</span>
                      <span className="ls-journey-mins">{step.mins} min</span>
                    </div>
                    <p className="ls-journey-desc">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
