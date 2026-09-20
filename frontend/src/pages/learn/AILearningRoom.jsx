/**
 * AILearningRoom — ONE continuous AI Learning experience.
 *
 * State is driven by the SERVER (session.status), not the frontend timer.
 * The client timer is UI-only: when it reaches zero the client calls the
 * server finish endpoint. The server validates elapsed time and either
 * accepts or rejects the transition.
 *
 * Server session.status → UI room state mapping:
 *   created     → intent_selection
 *   teaching    → teaching
 *   studying    → studying  (timer running)
 *   retrieval   → retrieval
 *   reteaching  → reteaching
 *   practice    → practice
 *   completed   → summary
 *   abandoned   → abandoned
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";
import { TutorAvatar } from "./AISessionSetup";

// ── Status → room phase mapping ───────────────────────────────────────────────
function serverStatusToPhase(status, hasMessages) {
  switch (status) {
    case "created":    return "preparing";
    case "teaching":   return hasMessages ? "teaching" : "preparing";
    case "studying":   return "studying";
    case "retrieval":  return "retrieval";
    case "reteaching": return "reteaching";
    case "practice":   return "practice";
    case "completed":  return "summary";
    case "abandoned":  return "abandoned";
    default:           return "intent_selection";
  }
}

// ── Intent options shown in room (mapped to backend INTENT_OPTIONS) ───────────
const ROOM_INTENTS = [
  { value: "teach_me",       label: "Teach me this",          icon: "📚" },
  { value: "explain_simply", label: "Explain it simply",      icon: "💡" },
  { value: "give_examples",  label: "Give me examples",       icon: "📝" },
  { value: "go_deeper",      label: "Go deeper",              icon: "🔬" },
  { value: "broaden",        label: "Broaden this",           icon: "🌐" },
  { value: "already_know",   label: "Test my knowledge",      icon: "🎯" },
  { value: "quiz_me",        label: "Quiz me straight away",  icon: "✅" },
];

const PHASE_LABELS = {
  preparing:        "Preparing",
  teaching:         "Learning",
  studying:         "Studying",
  retrieval:        "Recall",
  reteaching:       "Re-learning",
  practice:         "Practice",
  summary:          "Summary",
};

const PROGRESS_PHASES = ["teaching", "studying", "retrieval", "practice", "summary"];

export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  // ── Core session state ────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [session,      setSession]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [phase,        setPhase]        = useState("preparing");
  const [error,        setError]        = useState(null);

  // ── Teaching ──────────────────────────────────────────────────────────────
  const [teaching,     setTeaching]     = useState(null);
  const [aiWorking,    setAiWorking]    = useState(false);

  // ── Study timer ───────────────────────────────────────────────────────────
  const [studyPeriod,  setStudyPeriod]  = useState(null);   // StudyPeriodOut
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerPaused,  setTimerPaused]  = useState(false);
  const timerRef  = useRef(null);
  const pausedRef = useRef(false);

  // ── Retrieval ─────────────────────────────────────────────────────────────
  const [questions,    setQuestions]    = useState([]);
  const [qIndex,       setQIndex]       = useState(0);
  const [answerInput,  setAnswerInput]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [lastEval,     setLastEval]     = useState(null);  // last AnswerOut

  // ── Summary ───────────────────────────────────────────────────────────────
  const [summary,      setSummary]      = useState(null);

  // ── Input ─────────────────────────────────────────────────────────────────
  const [msgInput,     setMsgInput]     = useState("");

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, lastEval]);

  // ── Load / resume session ─────────────────────────────────────────────────
  useEffect(() => {
    loadAndResume();
    return () => clearTimer();
  }, [sessionId]);

  async function loadAndResume() {
    setLoading(true);
    setError(null);
    try {
      const [sess, msgs] = await Promise.all([
        api.getAISession(sessionId),
        api.getSessionMessages(sessionId),
      ]);
      applyServerState(sess, msgs);
      if (sess.status === "created") {
        await prepareSessionIfNeeded(sess);
      }
    } catch (err) {
      setError(err.message || "Failed to load session.");
    } finally {
      setLoading(false);
    }
  }

  async function prepareSessionIfNeeded(sess) {
    if (!sess || sess.status !== "created") return;

    setAiWorking(true);
    setPhase("preparing");
    setError(null);
    try {
      await api.prepareAISession(sessionId);
      const [freshSession, freshMessages] = await Promise.all([
        api.getAISession(sessionId),
        api.getSessionMessages(sessionId),
      ]);
      applyServerState(freshSession, freshMessages);
    } catch (err) {
      setError(err.message || "The AI tutor could not prepare this session.");
    } finally {
      setAiWorking(false);
    }
  }

  /** Apply server state to all local UI state — used on load and after mutations. */
  function applyServerState(sess, msgs) {
    setSession(sess);
    setMessages(msgs || []);

    const derivedPhase = serverStatusToPhase(
      sess.status,
      (msgs || []).filter(m => m.messageType === "teaching" || m.messageType === "reteach").length > 0,
    );
    setPhase(derivedPhase);

    // Resume teaching content
    if (sess.teaching) {
      setTeaching(sess.teaching);
    }

    // Resume summary
    if (sess.summary) {
      setSummary(sess.summary);
    }

    // Resume active study timer
    if (sess.activeStudyPeriod && sess.status === "studying") {
      const remaining = sess.activeStudyPeriod.remainingSeconds ?? 0;
      setStudyPeriod(sess.activeStudyPeriod);
      if (remaining > 0) {
        startClientTimer(remaining, sess.activeStudyPeriod.id);
      } else {
        // Timer already expired server-side — transition immediately
        handleServerTimerExpired(sess.activeStudyPeriod.id);
      }
    }

    // Resume questions if in retrieval/practice
    if (
      (derivedPhase === "retrieval" || derivedPhase === "practice") &&
      sess.questions?.length > 0
    ) {
      setQuestions(sess.questions);
      setQIndex(0);
    }
  }

  // ── Client-side timer (UI only) ───────────────────────────────────────────
  function startClientTimer(seconds, periodId) {
    clearTimer();
    setTimerSeconds(seconds);
    pausedRef.current = false;
    setTimerPaused(false);
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearTimer();
          handleServerTimerExpired(periodId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function toggleTimerPause() {
    pausedRef.current = !pausedRef.current;
    setTimerPaused(pausedRef.current);
  }

  /** Timer reached zero on client — tell server to finish the study period. */
  async function handleServerTimerExpired(periodId) {
    clearTimer();
    try {
      await api.finishStudyPeriod(sessionId, periodId);
      // Refresh to get server-authoritative retrieval state
      const [sess, msgs] = await Promise.all([
        api.getAISession(sessionId),
        api.getSessionMessages(sessionId),
      ]);
      applyServerState(sess, msgs);
    } catch (err) {
      // Server may reject early finish — show error but don't crash
      setError(err.message || "Could not transition to retrieval. Please try again.");
      // Resume timer with remaining server time if available
      loadAndResume();
    }
  }

  // ── Intent dispatch ───────────────────────────────────────────────────────
  async function handleIntentSelect(intentValue) {
    setAiWorking(true);
    setError(null);
    try {
      // "quiz_me" and "already_know" go straight to retrieval questions
      if (intentValue === "quiz_me" || intentValue === "already_know") {
        // First ensure a teaching snapshot exists (even empty/diagnostic)
        const t = await api.teachConcept(sessionId);
        setTeaching(t);
        addOptimisticTeachingMessage(t);
        // Immediately start retrieval
        await triggerRetrieval();
        return;
      }

      // All other intents: generate teaching
      const t = await api.teachConcept(sessionId);
      setTeaching(t);
      addOptimisticTeachingMessage(t);

      const sess = await api.getAISession(sessionId);
      setSession(sess);
      setPhase("teaching");
    } catch (err) {
      setError(err.message || "AI service error. Please try again.");
    } finally {
      setAiWorking(false);
    }
  }

  function addOptimisticTeachingMessage(t) {
    if (!t?.explanation) return;
    setMessages(prev => [
      ...prev,
      {
        id:          `local-${Date.now()}`,
        role:        "ai",
        messageType: "teaching",
        content:     t.explanation,
        sequence:    prev.length + 1,
        createdAt:   new Date().toISOString(),
        extra:       { strategy: t.strategy },
      },
    ]);
  }

  // ── Start study period ────────────────────────────────────────────────────
  async function handleStartStudy() {
    setAiWorking(true);
    setError(null);
    try {
      const period = await api.startStudyPeriod(sessionId, 300);
      setStudyPeriod(period);
      setSession(prev => ({ ...prev, status: "studying" }));
      setPhase("studying");
      startClientTimer(period.durationSeconds, period.id);
    } catch (err) {
      setError(err.message || "Failed to start study period.");
    } finally {
      setAiWorking(false);
    }
  }

  // ── Teaching tool buttons ─────────────────────────────────────────────────
  async function handleTeachingAction(action) {
    const actionMessages = {
      show_example:        "Can you show me a concrete example?",
      explain_differently: "Can you explain this using a different approach?",
      make_simpler:        "Can you explain this more simply?",
      go_deeper:           "Can you go into more depth on this?",
      why:                 "Why does this work this way?",
      real_world:          "Can you give me a real-world example of this?",
    };
    const msg = actionMessages[action] || action;
    await handleSendMessage(msg);
  }

  // ── Free-form message ─────────────────────────────────────────────────────
  async function handleSendMessage(text) {
    const content = (text || msgInput).trim();
    if (!content || aiWorking) return;
    setMsgInput("");
    setAiWorking(true);
    setError(null);

    // Optimistic student message
    setMessages(prev => [...prev, {
      id:          `local-${Date.now()}`,
      role:        "student",
      messageType: "question",
      content,
      sequence:    prev.length + 1,
      createdAt:   new Date().toISOString(),
    }]);

    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      setMessages(prev => [...prev, msg]);
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setAiWorking(false);
    }
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────
  async function triggerRetrieval() {
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3);
      // qs is an array directly (not {questions: []})
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      setSession(prev => ({ ...prev, status: "retrieval" }));
      setPhase("retrieval");
    } finally {
      setAiWorking(false);
    }
  }

  async function handleStartRetrieval() {
    setAiWorking(true);
    setError(null);
    try {
      await triggerRetrieval();
    } catch (err) {
      setError(err.message || "Failed to generate questions.");
      setAiWorking(false);
    }
  }

  // ── Answer submission ─────────────────────────────────────────────────────
  async function handleSubmitAnswer() {
    if (!answerInput.trim() || submitting) return;
    const question = questions[qIndex];
    if (!question) return;

    setSubmitting(true);
    setError(null);
    try {
      // Backend returns AnswerOut with understanding/needsReteach fields
      const evaluation = await api.submitAnswer(
        sessionId,
        question.id,
        answerInput.trim(),
        null,
      );
      setLastEval(evaluation);
      setAnswerInput("");

      // Add feedback message to conversation
      if (evaluation.feedback) {
        setMessages(prev => [...prev, {
          id:          `local-eval-${Date.now()}`,
          role:        "ai",
          messageType: "feedback",
          content:     evaluation.feedback,
          sequence:    prev.length + 1,
          createdAt:   new Date().toISOString(),
          extra:       {
            score:          evaluation.score,
            understanding:  evaluation.understanding,
            isCorrect:      evaluation.isCorrect,
          },
        }]);
      }

      // Refresh session status from server
      const sess = await api.getAISession(sessionId);
      setSession(sess);

      // Determine next step from server state + evaluation
      if (evaluation.needsReteach) {
        // Server has already transitioned to 'reteaching' — trigger reteach
        setPhase("reteaching");
        await doReteach(evaluation.misconception, evaluation.recommendedStrategy);
      } else if (qIndex < questions.length - 1) {
        // More questions remaining
        setQIndex(prev => prev + 1);
        setLastEval(null);
      } else {
        // All questions answered with passing scores — go to summary
        await doSummary();
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Adaptive reteaching ───────────────────────────────────────────────────
  async function doReteach(misconception, recommendedStrategy) {
    setAiWorking(true);
    setError(null);
    try {
      const reason = misconception
        ? `Student misconception: ${misconception}`
        : "Student answer score below threshold";
      const t = await api.generateAdaptiveReteach(sessionId, reason);
      setTeaching(t);

      // Add reteach message to conversation
      if (t?.explanation) {
        setMessages(prev => [...prev, {
          id:          `local-reteach-${Date.now()}`,
          role:        "ai",
          messageType: "reteach",
          content:     t.explanation,
          sequence:    prev.length + 1,
          createdAt:   new Date().toISOString(),
          extra:       { strategy: t.strategy },
        }]);
      }

      setPhase("reteaching");
      setLastEval(null);
    } catch (err) {
      setError(err.message || "Failed to generate new explanation.");
    } finally {
      setAiWorking(false);
    }
  }

  async function handleRequestReteach() {
    await doReteach(null, null);
  }

  // ── After reteach: study again ────────────────────────────────────────────
  async function handleStudyReteach() {
    setAiWorking(true);
    setError(null);
    try {
      const period = await api.startStudyPeriod(sessionId, 240); // 4 min for reteach
      setStudyPeriod(period);
      setSession(prev => ({ ...prev, status: "studying" }));
      setPhase("studying");
      startClientTimer(period.durationSeconds, period.id);
    } catch (err) {
      setError(err.message || "Failed to start study period.");
    } finally {
      setAiWorking(false);
    }
  }

  // ── After reteach: go straight to new questions ───────────────────────────
  async function handlePracticeAfterReteach() {
    setAiWorking(true);
    setError(null);
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 2);
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      // Server is in 'reteaching' — backend now accepts reteaching for question generation
      setPhase("practice");
    } catch (err) {
      setError(err.message || "Failed to generate practice questions.");
    } finally {
      setAiWorking(false);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  async function doSummary() {
    setAiWorking(true);
    setError(null);
    try {
      const s = await api.generateSessionSummary(sessionId);
      // generateSessionSummary returns SummaryOut directly (not {summary: …})
      setSummary(s);
      setSession(prev => ({ ...prev, status: "completed" }));
      setPhase("summary");
    } catch (err) {
      setError(err.message || "Failed to generate summary.");
    } finally {
      setAiWorking(false);
    }
  }

  // ── End session (early exit = abandon) ───────────────────────────────────
  async function handleEndSession() {
    if (!window.confirm(
      "End this session?\n\nYour progress so far will be saved but the session won't be marked as completed."
    )) return;
    try {
      await api.abandonAISession(sessionId);
      navigate("/app/learn/ai");
    } catch (err) {
      setError(err.message || "Failed to end session.");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="air-shell">
        <div className="air-topbar">
          <div className="skeleton skeleton-text" style={{ width: 140, height: 20 }} />
        </div>
        <div className="air-body">
          <div className="skeleton skeleton-text" style={{ width: "70%", height: 80, margin: "32px auto" }} />
          <div className="skeleton skeleton-text" style={{ width: "50%", height: 20, margin: "12px auto" }} />
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="air-shell">
        <div className="air-body" style={{ textAlign: "center", padding: "80px 24px" }}>
          <p style={{ color: "var(--ai-error)", marginBottom: 20 }}>{error}</p>
          <button className="ai-btn-secondary" onClick={() => navigate("/app/learn/ai")}>
            Back to AI Learning
          </button>
        </div>
      </div>
    );
  }

  if (phase === "abandoned") {
    return (
      <div className="air-shell">
        <div className="air-body" style={{ textAlign: "center", padding: "80px 24px" }}>
          <p style={{ color: "var(--ai-text-secondary)", marginBottom: 20 }}>
            This session was ended early.
          </p>
          <button className="ai-btn-primary" onClick={() => navigate("/app/learn/ai")}>
            Back to AI Learning
          </button>
        </div>
      </div>
    );
  }

  const conceptName  = session?.conceptName  || "Concept";
  const subjectName  = session?.subjectName  || "";
  const topicName    = session?.topicName    || "";
  const familiarityLabel = {
    new: "Completely new",
    seen_before: "Seen it before",
    know_basics: "Understands the basics",
    know_well: "Knows it well",
    need_help: "Needs help with something specific",
  }[session?.studentFamiliarity] || session?.studentFamiliarity || "";
  const intentLabel = {
    teach_me: "Teach me this",
    explain_simply: "Explain it simply",
    give_examples: "Give me examples",
    go_deeper: "Go deeper",
    broaden: "Broaden this",
    already_know: "Test my knowledge",
    quiz_me: "Quiz me straight away",
  }[session?.intent] || session?.intent || "";

  return (
    <div className="air-shell">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="air-topbar">
        <button
          className="air-topbar-back"
          aria-label="Back to AI Learning"
          onClick={() => navigate("/app/learn/ai")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="air-topbar-info">
          <span className="air-topbar-title">AI Learning</span>
          {(subjectName || topicName) && (
            <span className="air-topbar-meta">
              {[subjectName, topicName].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>

        <SessionProgress currentPhase={phase} />

        <button
          className="air-end-btn"
          onClick={handleEndSession}
          aria-label="End session"
        >
          End
        </button>
      </header>

      {/* ── Main body ────────────────────────────────────────────────────── */}
      <main className="air-body">
        <section className="air-chat-column">
          {/* Error banner */}
          {error && (
            <div className="air-error-banner" role="alert">
              {error}
              <button
                className="air-error-dismiss"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Message history ──────────────────────────────────────────── */}
          <div className="air-messages" aria-live="polite" aria-label="Learning conversation">
          {messages
            .filter(m => m.messageType !== "welcome" && m.messageType !== "system"
              && m.messageType !== "timer_start" && m.messageType !== "timer_end")
            .map((msg, idx) => (
              <Message
                key={msg.id || idx}
                msg={msg}
                isHidden={phase === "retrieval" && msg.messageType === "teaching"}
              />
            ))
          }

          {aiWorking && <TypingIndicator />}

          {/* ── Phase-specific overlays ─────────────────────────────── */}

          {/* PREPARING */}
          {phase === "preparing" && (
            <div className="air-preparing-panel">
              <TutorAvatar size={44} />
              <div>
                <h2>Getting your lesson ready…</h2>
                <p>Your subject, concept, familiarity, and learning goal are being used to prepare your tutor.</p>
              </div>
            </div>
          )}

          {/* TEACHING ACTIONS */}
          {phase === "teaching" && !aiWorking && (
            <TeachingActions
              onStartStudy={handleStartStudy}
              onAction={handleTeachingAction}
            />
          )}

          {/* STUDYING — timer */}
          {phase === "studying" && (
            <StudyTimerPanel
              seconds={timerSeconds}
              totalSeconds={studyPeriod?.durationSeconds || 300}
              paused={timerPaused}
              onTogglePause={toggleTimerPause}
            />
          )}

          {/* RETRIEVAL */}
          {(phase === "retrieval" || phase === "practice") && (
            questions.length > 0 ? (
              <RetrievalPanel
                question={questions[qIndex]}
                questionNumber={qIndex + 1}
                totalQuestions={questions.length}
                answer={answerInput}
                setAnswer={setAnswerInput}
                onSubmit={handleSubmitAnswer}
                submitting={submitting}
                lastEval={lastEval}
                onNext={qIndex < questions.length - 1
                  ? () => { setQIndex(q => q + 1); setLastEval(null); }
                  : null
                }
                onSummary={doSummary}
                onReteach={() => doReteach(lastEval?.misconception, lastEval?.recommendedStrategy)}
              />
            ) : (
              <div className="air-action-panel">
                <button className="ai-btn-primary" onClick={handleStartRetrieval} disabled={aiWorking}>
                  {aiWorking ? "Generating questions…" : "Start Recall Check"}
                </button>
              </div>
            )
          )}

          {/* RETEACHING ACTIONS */}
          {phase === "reteaching" && !aiWorking && (
            <ReteachActions
              onStudyAgain={handleStudyReteach}
              onPracticeNow={handlePracticeAfterReteach}
              onAskQuestion={() => inputRef.current?.focus()}
            />
          )}

          {/* SUMMARY */}
          {phase === "summary" && summary && (
            <SummaryPanel
              summary={summary}
              conceptName={conceptName}
              onContinue={() => navigate("/app/learn/ai")}
              onPracticeAgain={handlePracticeAfterReteach}
              onBackToTopic={() => navigate(-2)}
            />
          )}

          {phase === "summary" && !summary && aiWorking && (
            <div className="air-action-panel">
              <TypingIndicator label="Generating your session summary…" />
            </div>
          )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar — visible during teaching/reteaching only ──────── */}
        {(phase === "teaching" || phase === "reteaching") && (
          <div className="air-input-bar">
            <input
              ref={inputRef}
              type="text"
              className="air-input"
              placeholder={
                "Ask your tutor a question…"
              }
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !aiWorking && handleSendMessage()}
              aria-label="Message your tutor"
              disabled={aiWorking}
            />
            <button
              className="air-send-btn"
              onClick={() => handleSendMessage()}
              disabled={!msgInput.trim() || aiWorking}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        )}
        </section>

        <aside className="air-context-panel" aria-label="Session details">
          <div className="air-context-card air-context-card-primary">
            <div className="air-context-kicker">YOU'RE LEARNING</div>
            <h2>{conceptName}</h2>
            <p>{[subjectName, topicName].filter(Boolean).join(" · ")}</p>
          </div>

          <div className="air-context-card">
            <h3>Session setup</h3>
            <div className="air-context-row">
              <span>Familiarity</span>
              <strong>{familiarityLabel}</strong>
            </div>
            <div className="air-context-row">
              <span>Goal</span>
              <strong>{intentLabel}</strong>
            </div>
            {session?.studentNote && (
              <div className="air-context-note">
                <span>Your note</span>
                <p>{session.studentNote}</p>
              </div>
            )}
          </div>

          <div className="air-context-card">
            <h3>How this session works</h3>
            <div className="air-flow-list">
              <div><span>1</span><p>Learn with your AI tutor</p></div>
              <div><span>2</span><p>Study the explanation</p></div>
              <div><span>3</span><p>Recall what you learned</p></div>
              <div><span>4</span><p>Practice and adapt if needed</p></div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Message bubble ────────────────────────────────────────────────────────────
function Message({ msg, isHidden }) {
  const isAI      = msg.role === "ai";
  const isFeedback= msg.messageType === "feedback";

  if (isHidden) {
    // Teaching content is hidden during retrieval — show placeholder
    return (
      <div className="air-msg air-msg-tutor">
        <div className="air-msg-avatar"><TutorAvatar size={32} /></div>
        <div className="air-msg-body">
          <span className="air-msg-label">PeerUp AI</span>
          <div className="air-msg-bubble air-msg-hidden">
            <span>📖 Teaching content — available after recall check completes.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`air-msg ${isAI ? "air-msg-tutor" : "air-msg-student"}`}>
      {isAI && (
        <div className="air-msg-avatar" aria-hidden="true">
          <TutorAvatar size={32} />
        </div>
      )}
      <div className="air-msg-body">
        {isAI && (
          <span className="air-msg-label">
            {msg.messageType === "reteach" ? "PeerUp AI · New Approach" : "PeerUp AI"}
          </span>
        )}
        <div className={`air-msg-bubble ${isFeedback ? "air-msg-feedback" : ""}`}>
          <RichText content={msg.content} />
          {isFeedback && msg.extra?.score !== undefined && msg.extra.score !== null && (
            <div className={`air-eval-badge understanding-${msg.extra.understanding || "partial"}`}>
              <UnderstandingLabel understanding={msg.extra.understanding} score={msg.extra.score} />
            </div>
          )}
        </div>
        {msg.extra?.strategy && (
          <span className="air-msg-strategy">
            Strategy: {formatStrategy(msg.extra.strategy)}
          </span>
        )}
      </div>
    </div>
  );
}

function UnderstandingLabel({ understanding, score }) {
  const labels = {
    strong:  "✓ Strong understanding",
    partial: "◑ Partial understanding",
    weak:    "✗ Needs more practice",
  };
  return (
    <span>
      {labels[understanding] || "Evaluated"} · {score}/100
    </span>
  );
}

// ── Rich text renderer (simple markdown) ─────────────────────────────────────
function RichText({ content }) {
  if (!content) return null;

  // Normalise line endings, then split into blocks on blank lines
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/);

  return (
    <div className="air-richtext">
      {blocks.map((block, i) => {
        // ── Fenced code block ──────────────────────────────────────────
        if (block.startsWith("```")) {
          const inner = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return <pre key={i} className="air-code-block"><code>{inner}</code></pre>;
        }

        // ── Display math  $$…$$ ────────────────────────────────────────
        const mathBlock = block.match(/^\$\$\n?([\s\S]+?)\n?\$\$$/);
        if (mathBlock) {
          return (
            <div key={i} className="air-math-block">
              <code>{mathBlock[1].trim()}</code>
            </div>
          );
        }

        const lines = block.split("\n");

        // ── Heading  # / ## / ### ──────────────────────────────────────
        const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          const rest = lines.slice(1).join("\n").trim();
          return (
            <div key={i}>
              <Tag className={`air-h${level}`}>{renderInline(headingMatch[2])}</Tag>
              {rest && <RichText content={rest} />}
            </div>
          );
        }

        // ── Bullet list  - item  or  * item ───────────────────────────
        if (lines.every(l => l.trim() === "" || /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={i} className="air-list">
              {lines.filter(l => /^[-*]\s/.test(l.trim())).map((l, j) => (
                <li key={j}>{renderInline(l.trim().replace(/^[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }

        // ── Numbered list  1. item ─────────────────────────────────────
        if (lines.every(l => l.trim() === "" || /^\d+\.\s/.test(l.trim()))) {
          return (
            <ol key={i} className="air-list air-list-ordered">
              {lines.filter(l => /^\d+\.\s/.test(l.trim())).map((l, j) => (
                <li key={j}>{renderInline(l.trim().replace(/^\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        }

        // ── Horizontal rule  ---  ──────────────────────────────────────
        if (/^---+$/.test(block.trim())) {
          return <hr key={i} className="air-divider" />;
        }

        // ── Default: paragraph ─────────────────────────────────────────
        return <p key={i}>{renderInline(block)}</p>;
      })}
    </div>
  );
}

/**
 * Render inline markdown within a single line/paragraph:
 *   **bold**   *italic*   `code`   $math$
 */
function renderInline(text) {
  if (!text) return null;
  // Split on inline patterns: **bold**, *italic*, `code`, $math$
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\$[^$\n]+\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="air-inline-code">{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$"))
      return <code key={i} className="air-inline-math">{part.slice(1, -1)}</code>;
    return part;
  });
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ label = "PeerUp AI is thinking…" }) {
  return (
    <div className="air-msg air-msg-tutor">
      <div className="air-msg-avatar" aria-hidden="true"><TutorAvatar size={32} /></div>
      <div className="air-msg-body">
        <span className="air-msg-label">PeerUp AI</span>
        <div className="air-typing" aria-label={label}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

// ── Session progress bar ──────────────────────────────────────────────────────
function SessionProgress({ currentPhase }) {
  const phases = [
    { key: "teaching",   label: "Learn" },
    { key: "studying",   label: "Study" },
    { key: "retrieval",  label: "Recall" },
    { key: "practice",   label: "Practice" },
    { key: "summary",    label: "Done" },
  ];
  const idx = phases.findIndex(p =>
    currentPhase === p.key ||
    (currentPhase === "reteaching" && p.key === "practice")
  );

  return (
    <div className="air-progress" aria-label="Session progress">
      {phases.map((p, i) => (
        <div
          key={p.key}
          className={`air-progress-step ${i < idx ? "done" : ""} ${i === idx ? "active" : ""}`}
          aria-current={i === idx ? "step" : undefined}
          title={p.label}
        >
          <span className="air-progress-dot" />
          <span className="air-progress-label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Intent selection panel ────────────────────────────────────────────────────
function IntentPanel({ conceptName, onSelect, msgInput, setMsgInput, onSend }) {
  return (
    <div className="air-intent-panel">
      <div className="air-intent-header">
        <TutorAvatar size={48} />
        <div>
          <h2 className="air-intent-title">What would you like to do?</h2>
          <p className="air-intent-subtitle">Learning: <strong>{conceptName}</strong></p>
        </div>
      </div>
      <div className="air-intent-grid">
        {ROOM_INTENTS.map(opt => (
          <button
            key={opt.value}
            className="air-intent-btn"
            onClick={() => onSelect(opt.value)}
          >
            <span className="air-intent-icon" aria-hidden="true">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Teaching action bar ───────────────────────────────────────────────────────
function TeachingActions({ onStartStudy, onAction }) {
  return (
    <div className="air-action-panel">
      <div className="air-action-primary">
        <button className="ai-btn-primary" onClick={onStartStudy}>
          📖 Start Study Timer
        </button>
      </div>
      <div className="air-action-tools">
        <span className="air-action-tools-label">Ask for:</span>
        {[
          { key: "show_example",        label: "An example" },
          { key: "explain_differently", label: "Different approach" },
          { key: "make_simpler",        label: "Simpler explanation" },
          { key: "go_deeper",           label: "More depth" },
          { key: "why",                 label: "Why this works" },
          { key: "real_world",          label: "Real-world example" },
        ].map(a => (
          <button key={a.key} className="air-tool-btn" onClick={() => onAction(a.key)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Study timer panel ─────────────────────────────────────────────────────────
function StudyTimerPanel({ seconds, totalSeconds, paused, onTogglePause }) {
  const pct        = totalSeconds > 0 ? seconds / totalSeconds : 0;
  const radius     = 54;
  const circumference = 2 * Math.PI * radius;
  const dash       = circumference * pct;
  const isWarning  = seconds > 0 && seconds <= 60;

  return (
    <div className="air-study-panel" aria-live="polite">
      <h3 className="air-study-title">Study this explanation</h3>
      <p className="air-study-subtitle">
        Read carefully — you'll be tested on this when the timer ends.
      </p>
      <div className="air-timer-wrap">
        <svg
          className="air-timer-svg"
          viewBox="0 0 120 120"
          aria-label={`${formatTime(seconds)} remaining`}
        >
          <circle cx="60" cy="60" r={radius} className="air-timer-track" />
          <circle
            cx="60" cy="60" r={radius}
            className={`air-timer-fill ${isWarning ? "warning" : ""}`}
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 60 60)"
            strokeLinecap="round"
          />
        </svg>
        <div className="air-timer-center" aria-hidden="true">
          <span className={`air-timer-digits ${isWarning ? "warning" : ""}`}>
            {formatTime(seconds)}
          </span>
          {paused && <span className="air-timer-paused-label">Paused</span>}
        </div>
      </div>
      {isWarning && seconds > 0 && (
        <p className="air-study-warning">
          ⏰ Almost done — finish reading the explanation above.
        </p>
      )}
      {seconds === 0 && (
        <p className="air-study-warning">
          ⏱ Time's up! Transitioning to recall check…
        </p>
      )}
      <button
        className="ai-btn-secondary"
        onClick={onTogglePause}
        aria-pressed={paused}
        style={{ marginTop: 12 }}
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}

// ── Retrieval question panel ──────────────────────────────────────────────────
function RetrievalPanel({
  question, questionNumber, totalQuestions,
  answer, setAnswer, onSubmit, submitting,
  lastEval, onNext, onSummary, onReteach,
}) {
  if (!question) return null;

  const showResult = !!lastEval;

  return (
    <div className="air-retrieval-panel">
      <div className="air-q-header">
        <span className="air-q-badge">Question {questionNumber} of {totalQuestions}</span>
        <span className={`air-q-type type-${question.questionType}`}>
          {formatQType(question.questionType)}
        </span>
      </div>

      <div className="air-q-card">
        <p className="air-q-text">{question.question}</p>

        {/* Multiple choice */}
        {question.questionType === "multiple_choice" && question.options?.length > 0 ? (
          <div className="air-mc-options" role="radiogroup" aria-label="Answer options">
            {question.options.map(opt => (
              <button
                key={opt.label}
                role="radio"
                aria-checked={answer === opt.label}
                className={`air-mc-btn${answer === opt.label ? " selected" : ""}`}
                onClick={() => !showResult && setAnswer(opt.label)}
                disabled={showResult}
              >
                <span className="air-mc-label">{opt.label}</span>
                <span className="air-mc-text">{opt.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <textarea
            className="air-answer-input"
            placeholder="Type your answer here…"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={4}
            disabled={showResult || submitting}
            aria-label="Your answer"
          />
        )}

        {/* Submit / Next / Reteach buttons */}
        {!showResult ? (
          <button
            className="ai-btn-primary"
            onClick={onSubmit}
            disabled={!answer.trim() || submitting}
            aria-busy={submitting}
          >
            {submitting ? "Checking…" : "Submit Answer"}
          </button>
        ) : (
          <EvalResult
            eval={lastEval}
            hasNext={!!onNext}
            onNext={onNext}
            onSummary={onSummary}
            onReteach={onReteach}
          />
        )}
      </div>
    </div>
  );
}

function EvalResult({ eval: ev, hasNext, onNext, onSummary, onReteach }) {
  const understanding = ev?.understanding || "partial";
  const isStrong  = understanding === "strong";
  const isWeak    = understanding === "weak";

  return (
    <div className="air-eval-result">
      <div className={`air-eval-tag understanding-${understanding}`}>
        {isStrong  ? "✓ Strong understanding" : ""}
        {understanding === "partial" ? "◑ Getting there" : ""}
        {isWeak    ? "✗ Let's try again" : ""}
        {ev?.score !== null && ev?.score !== undefined ? ` · ${ev.score}/100` : ""}
      </div>

      {ev?.misconception && (
        <p className="air-eval-misconception">
          💡 <strong>Misconception identified:</strong> {ev.misconception}
        </p>
      )}

      <div className="air-eval-actions">
        {ev?.needsReteach ? (
          <button className="ai-btn-primary" onClick={onReteach}>
            Let's try a different approach
          </button>
        ) : hasNext ? (
          <button className="ai-btn-primary" onClick={onNext}>
            Next Question →
          </button>
        ) : (
          <button className="ai-btn-primary" onClick={onSummary}>
            View Session Summary
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reteach action panel ──────────────────────────────────────────────────────
function ReteachActions({ onStudyAgain, onPracticeNow, onAskQuestion }) {
  return (
    <div className="air-action-panel">
      <p className="air-action-hint">
        A fresh explanation has been provided above. What would you like to do?
      </p>
      <div className="air-action-buttons">
        <button className="ai-btn-primary" onClick={onStudyAgain}>
          📖 Study this explanation
        </button>
        <button className="ai-btn-secondary" onClick={onPracticeNow}>
          ✅ Try practice questions now
        </button>
        <button className="air-tool-btn" onClick={onAskQuestion}>
          💬 Ask a question
        </button>
      </div>
    </div>
  );
}

// ── Session summary panel ─────────────────────────────────────────────────────
function SummaryPanel({ summary, conceptName, onContinue, onPracticeAgain, onBackToTopic }) {
  return (
    <div className="air-summary-panel">
      <div className="air-summary-header">
        <div className="air-summary-icon">🎓</div>
        <h2 className="air-summary-title">Session Complete</h2>
        <p className="air-summary-concept">{conceptName}</p>
      </div>

      {summary.overallScore !== null && summary.overallScore !== undefined && (
        <div className="air-summary-score">
          <div className="air-score-ring" style={{
            "--score-pct": `${summary.overallScore}%`,
            "--score-color": summary.overallScore >= 70 ? "var(--ai-success)" : summary.overallScore >= 50 ? "var(--ai-warning)" : "var(--ai-error)",
          }}>
            <span className="air-score-num">{summary.overallScore}</span>
            <span className="air-score-label">/ 100</span>
          </div>
          <p className="air-score-subtext">
            {summary.questionsCorrect} of {summary.questionsAnswered} questions correct
            {summary.reteachCount > 0 ? ` · ${summary.reteachCount} reteaching round${summary.reteachCount > 1 ? "s" : ""}` : ""}
          </p>
        </div>
      )}

      {summary.summaryText && (
        <div className="air-summary-section">
          <h3 className="air-summary-section-title">What you learned</h3>
          <p className="air-summary-text">{summary.summaryText}</p>
        </div>
      )}

      {summary.strengths?.length > 0 && (
        <div className="air-summary-section">
          <h3 className="air-summary-section-title">✓ What you understood well</h3>
          <ul className="air-summary-list">
            {summary.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {summary.areasForPractice?.length > 0 && (
        <div className="air-summary-section">
          <h3 className="air-summary-section-title">📝 What needs more practice</h3>
          <ul className="air-summary-list">
            {summary.areasForPractice.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {summary.keyIdeas?.length > 0 && (
        <div className="air-summary-section">
          <h3 className="air-summary-section-title">💡 Key ideas to remember</h3>
          <ul className="air-summary-list">
            {summary.keyIdeas.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </div>
      )}

      {summary.recommendedNext && (
        <div className="air-summary-next">
          <h3 className="air-summary-section-title">→ Recommended next step</h3>
          <p>{summary.recommendedNext}</p>
        </div>
      )}

      <div className="air-summary-actions">
        <button className="ai-btn-primary" onClick={onContinue}>
          Continue Learning
        </button>
        <button className="ai-btn-secondary" onClick={onPracticeAgain}>
          Practice Again
        </button>
        <button className="air-tool-btn" onClick={onBackToTopic}>
          Back to Topic
        </button>
      </div>
    </div>
  );
}

// ── Icon components ───────────────────────────────────────────────────────────
function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

// ── Utility formatters ────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatStrategy(s) {
  return s?.replace(/_/g, " ") || "";
}

function formatQType(t) {
  const map = {
    short_answer:    "Short answer",
    multiple_choice: "Multiple choice",
    calculation:     "Calculation",
    explanation:     "Explain in your own words",
    true_false:      "True / False",
    application:     "Application",
  };
  return map[t] || t;
}
