/**
 * ConceptLearnPage — /app/learn/concept/:conceptId
 *
 * Master page for the sequential learning pipeline.
 * All stage progression is authoritative from the backend.
 * Stage navigation is derived from backend progress, not local state.
 *
 * Stages: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

import LessonStage        from "../../components/learning/LessonStage";
import CheckpointStage    from "../../components/learning/CheckpointStage";
import ExplainStage       from "../../components/learning/ExplainStage";
import VerificationStage  from "../../components/learning/VerificationStage";
import AskAIStage         from "../../components/learning/AskAIStage";
import ChallengeReadyStage from "../../components/learning/ChallengeReadyStage";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="m5 12 5 5L20 7" />
  </svg>
);
const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconSpinner = () => (
  <svg className="clp-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" />
  </svg>
);

// Stage definitions in pipeline order
const STAGES = [
  { id: "lesson",          label: "Lesson",          emoji: "📖" },
  { id: "checkpoint",      label: "Checkpoint",      emoji: "✓"  },
  { id: "explain",         label: "Explain It",      emoji: "💭" },
  { id: "ai_verification", label: "AI Verification", emoji: "🤖" },
  { id: "ask_ai",          label: "Ask AI",          emoji: "💬" },
  { id: "challenge",       label: "Challenge",       emoji: "🎯" },
];

const STAGE_ORDER = ["lesson","checkpoint","explain","ai_verification","ask_ai","challenge","verified"];

function stageIndex(s) {
  const i = STAGE_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

/** Derive each stage's status from backend progress */
function getStageStatus(stageId, progress) {
  if (!progress) return "locked";
  const current = progress.currentStage || "lesson";

  if (stageId === "lesson") {
    return progress.lessonCompleted ? "completed" : "current";
  }
  if (stageId === "checkpoint") {
    if (progress.checkpointPassed) return "completed";
    if (current === "checkpoint")  return "current";
    if (stageIndex(current) > stageIndex("checkpoint")) return "completed";
    return "locked";
  }
  if (stageId === "explain") {
    if (progress.explanationPassed) return "completed";
    if (current === "explain")      return "current";
    if (stageIndex(current) > stageIndex("explain")) return "completed";
    return "locked";
  }
  if (stageId === "ai_verification") {
    if (progress.aiVerificationPassed) return "completed";
    if (current === "ai_verification") return "current";
    if (stageIndex(current) > stageIndex("ai_verification")) return "completed";
    return "locked";
  }
  if (stageId === "ask_ai") {
    if (stageIndex(current) > stageIndex("ask_ai")) return "completed";
    if (current === "ask_ai")                       return "current";
    return "locked";
  }
  if (stageId === "challenge") {
    if (progress.challengePassed) return "completed";
    if (progress.challengeEligible && stageIndex(current) >= stageIndex("ask_ai")) return "available";
    return "locked";
  }
  return "locked";
}

export default function ConceptLearnPage() {
  const { conceptId } = useParams();
  const navigate      = useNavigate();

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [concept,      setConcept]      = useState(null);
  const [topic,        setTopic]        = useState(null);
  const [subject,      setSubject]      = useState(null);
  const [progress,     setProgress]     = useState(null);
  const [activeStage,  setActiveStage]  = useState("lesson");

  const loadProgress = useCallback(async () => {
    try {
      const data = await api.conceptGetProgress(conceptId);
      setConcept(data.concept);
      setTopic(data.topic);
      setSubject(data.subject);
      setProgress(data.progress);
      // Set active stage to current backend stage
      const current = data.progress?.currentStage || "lesson";
      setActiveStage(current === "verified" ? "challenge" : current);
      return data.progress;
    } catch (err) {
      setError(err.message || "Failed to load concept.");
    }
  }, [conceptId]);

  useEffect(() => {
    setLoading(true);
    loadProgress().finally(() => setLoading(false));
  }, [loadProgress]);

  // Called by each stage component after a successful action
  const onStageComplete = useCallback(async () => {
    const updated = await loadProgress();
    return updated;
  }, [loadProgress]);

  // Navigate to a stage (only if accessible)
  function handleStageNav(stageId) {
    const st = getStageStatus(stageId, progress);
    if (st === "locked") return;
    setActiveStage(stageId);
  }

  if (loading) {
    return (
      <div className="clp-page">
        <div className="clp-loading">
          <IconSpinner />
          <span>Loading concept…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="clp-page">
        <div className="clp-error">
          <p>{error}</p>
          <button className="clp-btn-secondary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const verified = progress?.verified;

  return (
    <div className="clp-page">
      {/* Breadcrumb */}
      <div className="clp-breadcrumb">
        <button onClick={() => navigate("/app/learn")} className="clp-bc-link">Learn</button>
        <span>›</span>
        {subject && <><button onClick={() => navigate("/app/learn")} className="clp-bc-link">{subject.name}</button><span>›</span></>}
        {topic && <><button onClick={() => navigate(`/app/learn/topics/${topic.id}`)} className="clp-bc-link">{topic.name}</button><span>›</span></>}
        <span className="clp-bc-current">{concept?.name}</span>
      </div>

      {/* Header */}
      <div className="clp-header">
        <h1 className="clp-concept-title">{concept?.name}</h1>
        {concept?.explanation && (
          <p className="clp-concept-desc">{concept.explanation}</p>
        )}
        {verified && (
          <div className="clp-verified-badge">
            <IconCheck /> Concept Verified
          </div>
        )}
      </div>

      {/* Stage navigation — derived from backend progress */}
      <nav className="clp-stage-nav" aria-label="Learning stages">
        {STAGES.map(stage => {
          const st       = getStageStatus(stage.id, progress);
          const isActive = activeStage === stage.id;
          const clickable = st !== "locked";

          return (
            <button
              key={stage.id}
              className={[
                "clp-stage-btn",
                `clp-stage-${st}`,
                isActive ? "clp-stage-active" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleStageNav(stage.id)}
              disabled={!clickable}
              aria-current={isActive ? "step" : undefined}
              title={st === "locked" ? "Complete previous stages first" : stage.label}
            >
              <span className="clp-stage-icon">
                {st === "completed" ? <IconCheck /> :
                 st === "locked"    ? <IconLock  /> :
                 stage.emoji}
              </span>
              <span className="clp-stage-label">{stage.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Stage content */}
      <div className="clp-stage-body">
        {activeStage === "lesson" && (
          <LessonStage conceptId={conceptId} progress={progress} onComplete={onStageComplete} />
        )}
        {activeStage === "checkpoint" && (
          <CheckpointStage conceptId={conceptId} progress={progress} onComplete={onStageComplete} />
        )}
        {activeStage === "explain" && (
          <ExplainStage conceptId={conceptId} progress={progress} onComplete={onStageComplete} />
        )}
        {activeStage === "ai_verification" && (
          <VerificationStage conceptId={conceptId} progress={progress} />
        )}
        {activeStage === "ask_ai" && (
          <AskAIStage conceptId={conceptId} progress={progress} />
        )}
        {activeStage === "challenge" && (
          <ChallengeReadyStage
            conceptId={conceptId}
            concept={concept}
            progress={progress}
            onGoToAskAI={() => setActiveStage("ask_ai")}
          />
        )}
      </div>
    </div>
  );
}
