/**
 * LessonStage — AI Tutor lesson experience.
 *
 * Shows ALL blocks at once in a scrollable container.
 * AI Tutor header with Online indicator, introduction, learning goal.
 * "Complete Lesson →" button at the bottom marks the lesson done.
 */
import { useState, useEffect } from "react";
import * as api from "../../api";
import { LessonBlock } from "./LessonBlocks";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconBot() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" strokeWidth="2.5" />
      <line x1="16" y1="16" x2="16" y2="16" strokeWidth="2.5" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="ls-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconGemini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

// ─── AI Tutor header ──────────────────────────────────────────────────────────

function TutorHeader({ lesson, subject, topic, concept, blockCount }) {
  return (
    <div className="ls-tutor-header">
      <div className="ls-tutor-avatar">
        <IconBot />
      </div>
      <div className="ls-tutor-meta">
        <div className="ls-tutor-name-row">
          <span className="ls-tutor-name">AI Tutor</span>
          <span className="ls-bot-online" title="Online" />
        </div>
        <span className="ls-tutor-sub">
          <IconGemini /> Powered by Gemini
        </span>
      </div>
      <div className="ls-tutor-right">
        {blockCount > 0 && (
          <span className="ls-block-count">{blockCount} sections</span>
        )}
        {lesson?.estimatedMinutes && (
          <span className="ls-duration">~{lesson.estimatedMinutes} min</span>
        )}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LessonLoadingState({ concept, subject, topic }) {
  return (
    <div className="ls-loading">
      <div className="ls-tutor-header">
        <div className="ls-tutor-avatar"><IconBot /></div>
        <div className="ls-tutor-meta">
          <div className="ls-tutor-name-row">
            <span className="ls-tutor-name">AI Tutor</span>
            <span className="ls-bot-online" />
          </div>
          <span className="ls-tutor-sub"><IconGemini /> Powered by Gemini</span>
        </div>
      </div>
      <div className="ls-loading-body">
        <div className="ls-loading-icon"><IconSpinner /></div>
        <p className="ls-loading-title">AI Tutor is preparing your lesson…</p>
        <p className="ls-loading-sub">Building your lesson from the PeerUP curriculum.</p>
        <div className="ls-skeleton-blocks">
          <div className="ls-skeleton ls-skel-title" />
          <div className="ls-skeleton ls-skel-line" />
          <div className="ls-skeleton ls-skel-line ls-skel-short" />
          <div className="ls-skeleton ls-skel-line" />
          <div className="ls-skeleton ls-skel-line ls-skel-med" />
          <div className="ls-skeleton ls-skel-card" />
          <div className="ls-skeleton ls-skel-line ls-skel-short" />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LessonStage({ conceptId, progress, concept, topic, subject, onComplete }) {
  const [generating, setGenerating] = useState(false);
  const [lesson, setLesson]         = useState(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError]           = useState(null);

  // Load existing lesson from progress on mount
  useEffect(() => {
    if (progress?.lessonContent) {
      setLesson(progress.lessonContent);
    }
  }, [progress]);

  const blocks      = lesson?.blocks || [];
  const isCompleted = progress?.lessonCompleted;

  const conceptName = concept?.name  || "this concept";
  const subjectName = subject?.name  || "";
  const topicName   = topic?.name    || "";

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await api.conceptGenerateLesson(conceptId);
      if (!res.ok && !res.lesson) throw new Error(res.detail || "Failed to generate lesson");
      setLesson(res.lesson);
    } catch (err) {
      setError(err.message || "Your lesson couldn't be generated right now. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = async () => {
    try {
      setCompleting(true);
      setError(null);
      await api.conceptCompleteLesson(conceptId);
      if (onComplete) await onComplete();
    } catch (err) {
      setError(err.message || "Failed to mark lesson complete. Please try again.");
    } finally {
      setCompleting(false);
    }
  };

  // ── Loading ──
  if (generating) {
    return <LessonLoadingState concept={conceptName} subject={subjectName} topic={topicName} />;
  }

  // ── No lesson yet ──
  if (!lesson && !progress?.lessonContent) {
    return (
      <div className="ls-start-screen">
        <TutorHeader lesson={null} subject={subjectName} topic={topicName} concept={conceptName} blockCount={0} />
        <div className="ls-start-body">
          <div className="ls-start-icon"><IconBot /></div>
          <h2 className="ls-start-title">Ready to learn?</h2>
          <p className="ls-start-desc">
            Your AI tutor will teach you <strong>{conceptName}</strong> step by step,
            using examples and explanations drawn from the PeerUP curriculum.
          </p>
          <ul className="ls-start-features">
            <li><IconCheck /> Conversational, tutor-style teaching</li>
            <li><IconCheck /> Real-world examples and analogies</li>
            <li><IconCheck /> Checkpoint questions based on exactly what you learned</li>
          </ul>
          {error && <div className="ls-error"><p>{error}</p></div>}
          <button className="ls-btn-primary ls-btn-large" onClick={handleGenerate} disabled={generating}>
            Start Lesson
          </button>
        </div>
      </div>
    );
  }

  // ── Lesson completed ──
  if (isCompleted) {
    return (
      <div className="ls-completed">
        <TutorHeader lesson={lesson} subject={subjectName} topic={topicName} concept={conceptName} blockCount={blocks.length} />
        <div className="ls-completed-body">
          <div className="ls-completed-icon">✓</div>
          <h2>Lesson Complete</h2>
          <p>
            You've finished the <strong>{lesson?.title || conceptName}</strong> lesson.
            Proceed to the Checkpoint to test your understanding.
          </p>
        </div>
      </div>
    );
  }

  // ── Lesson active — show all blocks ──
  return (
    <div className="ls-lesson">
      <TutorHeader
        lesson={lesson}
        subject={subjectName}
        topic={topicName}
        concept={conceptName}
        blockCount={blocks.length}
      />

      <div className="ls-lesson-content">
        {/* Intro card */}
        {(lesson?.introduction || lesson?.learningGoal || lesson?.title) && (
          <div className="ls-lesson-intro">
            <div className="ls-bot-label">
              <span className="ls-bot-online" />
              AI Tutor
            </div>
            {lesson?.title && (
              <h2 className="ls-lesson-title-main">{lesson.title}</h2>
            )}
            {lesson?.introduction && (
              <p className="ls-intro-text">{lesson.introduction}</p>
            )}
            {lesson?.learningGoal && (
              <p className="ls-learning-goal">
                <IconTarget /> By the end of this lesson: {lesson.learningGoal}
              </p>
            )}
          </div>
        )}

        {/* Block progress indicator */}
        {blocks.length > 0 && (
          <div className="ls-block-progress-row">
            <span className="ls-block-progress-label">
              {blocks.length} section{blocks.length !== 1 ? "s" : ""}
            </span>
            <div className="ls-block-dots">
              {blocks.map((_, i) => (
                <span key={i} className="ls-block-dot ls-dot-done" />
              ))}
            </div>
          </div>
        )}

        {/* All blocks rendered at once */}
        {blocks.map((block, i) => (
          <LessonBlock key={i} block={block} />
        ))}

        {/* Footer */}
        <div className="ls-lesson-footer">
          <span className="ls-curriculum-note">
            This lesson is based on the PeerUP curriculum
          </span>
          <div className="ls-footer-actions">
            {error && <span className="ls-footer-error">{error}</span>}
            <button
              className="ls-btn-success"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? (
                <><IconSpinner /> Completing…</>
              ) : (
                <>Complete Lesson <IconArrow /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
