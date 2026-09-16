/**
 * ConceptLearnPage — /app/learn/concept/:conceptId
 *
 * Two-column layout:
 *   LEFT  — breadcrumb, concept header, AI tutor badge, stage tabs, stage content
 *   RIGHT — Learning Progress sidebar, Concept Information, Next Steps
 *
 * Pipeline: lesson → checkpoint → explain → ai_verification → ask_ai → challenge → verified
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

import LessonStage         from "../../components/learning/LessonStage";
import CheckpointStage     from "../../components/learning/CheckpointStage";
import ExplainStage        from "../../components/learning/ExplainStage";
import VerificationStage   from "../../components/learning/VerificationStage";
import AskAIStage          from "../../components/learning/AskAIStage";
import ChallengeReadyStage from "../../components/learning/ChallengeReadyStage";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function IconSpinner() {
  return (
    <svg className="clp-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}
function IconGemini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
function IconBot() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
    </svg>
  );
}

// ─── Stage definitions ────────────────────────────────────────────────────────

const STAGES = [
  { id: "lesson",          label: "Lesson",        short: "Lesson",    emoji: "📖", num: 1 },
  { id: "checkpoint",      label: "Checkpoint",    short: "Check",     emoji: "✓",  num: 2 },
  { id: "explain",         label: "Explain It",    short: "Explain",   emoji: "💭", num: 3 },
  { id: "ai_verification", label: "AI Review",     short: "AI Review", emoji: "🤖", num: 4 },
  { id: "ask_ai",          label: "Ask AI",        short: "Ask AI",    emoji: "💬", num: 5 },
  { id: "challenge",       label: "Challenge",     short: "Challenge", emoji: "🎯", num: 6 },
];

const STAGE_ORDER = ["lesson","checkpoint","explain","ai_verification","ask_ai","challenge","verified"];

function stageIdx(s) {
  const i = STAGE_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

/** Derive stage status from backend progress */
function getStatus(stageId, progress, lockedStages) {
  if (!progress) return "locked";
  const current = progress.currentStage || "lesson";
  const locked  = lockedStages || [];

  if (stageId === "challenge") {
    if (progress.challengePassed)   return "completed";
    if (progress.challengeEligible) return "available";
    return "locked";
  }

  const stageI   = stageIdx(stageId);
  const currentI = stageIdx(current);

  if (progress.verified) {
    if (stageId === "lesson"          && progress.lessonCompleted)    return "completed";
    if (stageId === "checkpoint"      && progress.checkpointPassed)   return "completed";
    if (stageId === "explain"         && progress.explanationPassed)  return "completed";
    if (stageId === "ai_verification" && progress.aiVerificationPassed) return "completed";
    if (stageId === "ask_ai")    return "completed";
    if (stageId === "challenge") return "completed";
  }

  if (locked.includes(stageId)) return "locked";

  if (stageId === "lesson") {
    return progress.lessonCompleted ? "completed" : "current";
  }
  if (stageI < currentI) return "completed";
  if (stageI === currentI) return "current";
  return "locked";
}

/** Human-readable sub-label for sidebar stage */
function stageSub(stageId, status, progress) {
  if (status === "completed") {
    if (stageId === "lesson")          return "Completed";
    if (stageId === "checkpoint")      return `Passed ${progress?.checkpointAttempts?.length ? `(${progress.checkpointAttempts.length} attempt${progress.checkpointAttempts.length > 1 ? "s" : ""})` : ""}`;
    if (stageId === "explain")         return "Verified";
    if (stageId === "ai_verification") return "Passed";
    if (stageId === "ask_ai")          return "Done";
    if (stageId === "challenge")       return "Verified";
  }
  if (status === "current") {
    if (stageId === "lesson")          return "In progress";
    if (stageId === "checkpoint")      return "Ready to attempt";
    if (stageId === "explain")         return "Write your explanation";
    if (stageId === "ai_verification") return "Review your results";
    if (stageId === "ask_ai")          return "Ask questions";
    if (stageId === "challenge")       return "In progress";
  }
  if (status === "available") return "Ready to start";
  return "Locked";
}

/** What should the student do next? */
function getNextStep(progress) {
  if (!progress) return { emoji: "📖", text: "Start by reading the AI-generated lesson." };
  if (progress.verified) return { emoji: "🏆", text: "Concept verified! You can move to the next concept." };
  const s = progress.currentStage;
  if (s === "lesson")          return { emoji: "📖", text: "Read through the AI lesson, then click Complete Lesson." };
  if (s === "checkpoint")      return { emoji: "✓",  text: "Answer the 3 checkpoint questions to test your understanding." };
  if (s === "explain")         return { emoji: "💭", text: "Write an explanation of the concept in your own words." };
  if (s === "ai_verification") return { emoji: "🤖", text: "Review your AI verification results." };
  if (s === "ask_ai")          return { emoji: "💬", text: "Ask the AI any questions, then attempt the Challenge when ready." };
  if (s === "challenge")       return { emoji: "🎯", text: "Find a peer to verify your understanding in a challenge session." };
  return { emoji: "📖", text: "Continue your learning journey." };
}

// ─── Sidebar components ───────────────────────────────────────────────────────

function LearningProgressSidebar({ progress, lockedStages, activeStage, onStageNav }) {
  return (
    <div className="clp-sidebar-card">
      <div className="clp-sidebar-card-title">Learning Progress</div>
      <div className="clp-sidebar-stages">
        {STAGES.map(stage => {
          const status  = getStatus(stage.id, progress, lockedStages);
          const isActive = activeStage === stage.id;
          const sub     = stageSub(stage.id, status, progress);
          const clickable = status !== "locked";
          return (
            <div
              key={stage.id}
              className={[
                "clp-sidebar-stage",
                `clp-ss-${status}`,
                isActive ? "clp-ss-active" : "",
                clickable ? "clp-ss-clickable" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => clickable && onStageNav(stage.id)}
              title={clickable ? stage.label : "Complete previous stages first"}
            >
              <div className="clp-sidebar-stage-num">
                {status === "completed" ? <IconCheck /> :
                 status === "locked"    ? <IconLock  /> :
                 stage.num}
              </div>
              <div className="clp-sidebar-stage-info">
                <div className="clp-sidebar-stage-name">{stage.label}</div>
                <div className="clp-sidebar-stage-sub">{sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConceptInfoSidebar({ concept, topic, subject, progress }) {
  const objectives = concept?.keyPoints || [];
  const diff = topic?.difficulty || "";
  const diffClass = diff === "beginner" ? "clp-diff-beginner"
                  : diff === "advanced" ? "clp-diff-advanced"
                  : "clp-diff-intermediate";

  return (
    <div className="clp-sidebar-card">
      <div className="clp-sidebar-card-title">Concept Information</div>
      <div className="clp-info-row">
        {subject && (
          <div className="clp-info-item">
            <span className="clp-info-label">Subject</span>
            <span className="clp-info-val">{subject.name}</span>
          </div>
        )}
        {topic && (
          <div className="clp-info-item">
            <span className="clp-info-label">Topic</span>
            <span className="clp-info-val">{topic.name}</span>
          </div>
        )}
        {diff && (
          <div className="clp-info-item">
            <span className="clp-info-label">Difficulty</span>
            <span className={`clp-difficulty-badge ${diffClass}`}>
              {diff.charAt(0).toUpperCase() + diff.slice(1)}
            </span>
          </div>
        )}
        {objectives.length > 0 && (
          <div className="clp-info-item">
            <span className="clp-info-label">Key Points</span>
            <ul className="clp-objectives-list">
              {objectives.slice(0, 4).map((kp, i) => (
                <li key={i}>{kp}</li>
              ))}
              {objectives.length > 4 && (
                <li style={{ color: "#64748b", fontStyle: "italic" }}>
                  +{objectives.length - 4} more
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NextStepsSidebar({ progress }) {
  const next = getNextStep(progress);
  return (
    <div className="clp-sidebar-card">
      <div className="clp-sidebar-card-title">Next Steps</div>
      <div className="clp-next-step">
        <span className="clp-next-step-icon">{next.emoji}</span>
        <p>{next.text}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConceptLearnPage() {
  const { conceptId } = useParams();
  const navigate      = useNavigate();

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [concept,      setConcept]      = useState(null);
  const [topic,        setTopic]        = useState(null);
  const [subject,      setSubject]      = useState(null);
  const [progress,     setProgress]     = useState(null);
  const [lockedStages, setLockedStages] = useState([]);
  const [activeStage,  setActiveStage]  = useState("lesson");

  const loadProgress = useCallback(async () => {
    try {
      const data = await api.conceptGetProgress(conceptId);
      setConcept(data.concept);
      setTopic(data.topic);
      setSubject(data.subject);
      setProgress(data.progress);
      setLockedStages(data.lockedStages || []);

      const current = data.progress?.currentStage || "lesson";
      setActiveStage(s => {
        const status = getStatus(s, data.progress, data.lockedStages || []);
        if (status === "locked") return current === "verified" ? "challenge" : current;
        return s;
      });
      return data.progress;
    } catch (err) {
      setError(err.message || "Failed to load concept.");
    }
  }, [conceptId]);

  useEffect(() => {
    setLoading(true);
    loadProgress().finally(() => setLoading(false));
  }, [loadProgress]);

  const onStageComplete = useCallback(async () => {
    return await loadProgress();
  }, [loadProgress]);

  function handleStageNav(stageId) {
    const status = getStatus(stageId, progress, lockedStages);
    if (status === "locked") return;
    setActiveStage(stageId);
  }

  // ── Loading ──
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

  // ── Error ──
  if (error) {
    return (
      <div className="clp-page">
        <div className="clp-error-card">
          <p className="clp-error-msg">{error}</p>
          <button className="ls-btn-ghost" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      </div>
    );
  }

  const verified = progress?.verified;

  return (
    <div className="clp-page">
      {/* Breadcrumb */}
      <div className="clp-breadcrumb">
        <button className="clp-bc-link" onClick={() => navigate("/app/learn")}>Learn</button>
        <span className="clp-bc-sep">›</span>
        {subject && (
          <>
            <button className="clp-bc-link" onClick={() => navigate("/app/learn")}>{subject.name}</button>
            <span className="clp-bc-sep">›</span>
          </>
        )}
        {topic && (
          <>
            <button className="clp-bc-link" onClick={() => navigate(`/app/learn/topics/${topic.id}`)}>{topic.name}</button>
            <span className="clp-bc-sep">›</span>
          </>
        )}
        <span className="clp-bc-current">{concept?.name}</span>
      </div>

      {/* Two-column layout */}
      <div className="clp-layout">
        {/* ── LEFT MAIN ── */}
        <div className="clp-main">
          {/* Concept header */}
          <div className="clp-header">
            <div className="clp-header-left">
              <h1 className="clp-concept-title">{concept?.name}</h1>
              {concept?.explanation && (
                <p className="clp-concept-desc">{concept.explanation}</p>
              )}
            </div>
            <div className="clp-header-right">
              {verified && (
                <div className="clp-verified-badge">
                  <IconCheck /> Verified
                </div>
              )}
              <div className="clp-ai-badge">
                <IconBot /> AI Tutor <span className="clp-ai-sep">·</span>
                <IconGemini /> Powered by Gemini
              </div>
            </div>
          </div>

          {/* Stage tab navigation */}
          <nav className="clp-stage-nav" aria-label="Learning stages">
            {STAGES.map(stage => {
              const status   = getStatus(stage.id, progress, lockedStages);
              const isActive = activeStage === stage.id;
              const clickable = status !== "locked";

              return (
                <button
                  key={stage.id}
                  className={[
                    "clp-stage-btn",
                    `clp-stage-${status}`,
                    isActive ? "clp-stage-active" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleStageNav(stage.id)}
                  disabled={!clickable}
                  title={status === "locked" ? "Complete previous stages first" : stage.label}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className="clp-stage-icon">
                    {status === "completed" ? <IconCheck /> :
                     status === "locked"    ? <IconLock  /> :
                     stage.num}
                  </span>
                  <span className="clp-stage-label">{stage.short}</span>
                </button>
              );
            })}
          </nav>

          {/* Stage content */}
          <div className="clp-stage-body">
            {activeStage === "lesson" && (
              <LessonStage
                conceptId={conceptId}
                progress={progress}
                concept={concept}
                topic={topic}
                subject={subject}
                onComplete={onStageComplete}
              />
            )}
            {activeStage === "checkpoint" && (
              <CheckpointStage
                conceptId={conceptId}
                progress={progress}
                onComplete={onStageComplete}
              />
            )}
            {activeStage === "explain" && (
              <ExplainStage
                conceptId={conceptId}
                progress={progress}
                onComplete={onStageComplete}
              />
            )}
            {activeStage === "ai_verification" && (
              <VerificationStage
                progress={progress}
              />
            )}
            {activeStage === "ask_ai" && (
              <AskAIStage
                conceptId={conceptId}
                progress={progress}
                concept={concept}
              />
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

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="clp-sidebar">
          <LearningProgressSidebar
            progress={progress}
            lockedStages={lockedStages}
            activeStage={activeStage}
            onStageNav={handleStageNav}
          />
          <ConceptInfoSidebar
            concept={concept}
            topic={topic}
            subject={subject}
            progress={progress}
          />
          <NextStepsSidebar progress={progress} />
        </aside>
      </div>
    </div>
  );
}
