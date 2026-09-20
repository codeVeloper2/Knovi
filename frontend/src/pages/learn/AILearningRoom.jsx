/**
 * AILearningRoom — WhatsApp-style fullscreen AI chat experience.
 *
 * Layout: fixed topbar + fixed input bar + scrollable messages between them.
 * No bottom nav, no sidebar, no parent chrome — renders standalone.
 *
 * State is driven by the SERVER (session.status), not the frontend timer.
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

const ROOM_INTENTS = [
  { value: "teach_me",       label: "Teach me this",         icon: "📚" },
  { value: "explain_simply", label: "Explain it simply",     icon: "💡" },
  { value: "give_examples",  label: "Give me examples",      icon: "📝" },
  { value: "go_deeper",      label: "Go deeper",             icon: "🔬" },
  { value: "broaden",        label: "Broaden this",          icon: "🌐" },
  { value: "already_know",   label: "Test my knowledge",     icon: "🎯" },
  { value: "quiz_me",        label: "Quiz me straight away", icon: "✅" },
];

export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();

  const [loading,      setLoading]      = useState(true);
  const [session,      setSession]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [phase,        setPhase]        = useState("preparing");
  const [error,        setError]        = useState(null);

  const [teaching,     setTeaching]     = useState(null);
  const [aiWorking,    setAiWorking]    = useState(false);

  const [studyPeriod,  setStudyPeriod]  = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerPaused,  setTimerPaused]  = useState(false);
  const timerRef  = useRef(null);
  const pausedRef = useRef(false);

  const [questions,    setQuestions]    = useState([]);
  const [qIndex,       setQIndex]       = useState(0);
  const [answerInput,  setAnswerInput]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [lastEval,     setLastEval]     = useState(null);

  const [summary,      setSummary]      = useState(null);
  const [msgInput,     setMsgInput]     = useState("");

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, lastEval]);

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

  function applyServerState(sess, msgs) {
    setSession(sess);
    setMessages(msgs || []);
    const derivedPhase = serverStatusToPhase(
      sess.status,
      (msgs || []).filter(m => m.messageType === "teaching" || m.messageType === "reteach").length > 0,
    );
    setPhase(derivedPhase);
    if (sess.teaching)  setTeaching(sess.teaching);
    if (sess.summary)   setSummary(sess.summary);
    if (sess.activeStudyPeriod && sess.status === "studying") {
      const remaining = sess.activeStudyPeriod.remainingSeconds ?? 0;
      setStudyPeriod(sess.activeStudyPeriod);
      if (remaining > 0) startClientTimer(remaining, sess.activeStudyPeriod.id);
      else handleServerTimerExpired(sess.activeStudyPeriod.id);
    }
    if ((derivedPhase === "retrieval" || derivedPhase === "practice") && sess.questions?.length > 0) {
      setQuestions(sess.questions);
      setQIndex(0);
    }
  }

  function startClientTimer(seconds, periodId) {
    clearTimer();
    setTimerSeconds(seconds);
    pausedRef.current = false;
    setTimerPaused(false);
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setTimerSeconds(prev => {
        if (prev <= 1) { clearTimer(); handleServerTimerExpired(periodId); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function toggleTimerPause() {
    pausedRef.current = !pausedRef.current;
    setTimerPaused(pausedRef.current);
  }

  async function handleServerTimerExpired(periodId) {
    clearTimer();
    try {
      await api.finishStudyPeriod(sessionId, periodId);
      const [sess, msgs] = await Promise.all([api.getAISession(sessionId), api.getSessionMessages(sessionId)]);
      applyServerState(sess, msgs);
    } catch (err) {
      setError(err.message || "Could not transition to retrieval. Please try again.");
      loadAndResume();
    }
  }

  async function handleIntentSelect(intentValue) {
    setAiWorking(true);
    setError(null);
    try {
      if (intentValue === "quiz_me" || intentValue === "already_know") {
        const t = await api.teachConcept(sessionId);
        setTeaching(t);
        addOptimisticTeachingMessage(t);
        await triggerRetrieval();
        return;
      }
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
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`, role: "ai", messageType: "teaching",
      content: t.explanation, sequence: prev.length + 1,
      createdAt: new Date().toISOString(), extra: { strategy: t.strategy },
    }]);
  }

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

  async function handleTeachingAction(action) {
    const actionMessages = {
      show_example:        "Can you show me a concrete example?",
      explain_differently: "Can you explain this using a different approach?",
      make_simpler:        "Can you explain this more simply?",
      go_deeper:           "Can you go into more depth on this?",
      why:                 "Why does this work this way?",
      real_world:          "Can you give me a real-world example of this?",
    };
    await handleSendMessage(actionMessages[action] || action);
  }

  async function handleSendMessage(text) {
    const content = (text || msgInput).trim();
    if (!content || aiWorking) return;
    setMsgInput("");
    setAiWorking(true);
    setError(null);
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`, role: "student", messageType: "question",
      content, sequence: prev.length + 1, createdAt: new Date().toISOString(),
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

  function injectQuestionBubble(questionArr, idx) {
    const q = questionArr[idx];
    if (!q) return;
    setMessages(prev => {
      // avoid duplicate if already present
      if (prev.some(m => m.id === `q-${q.id}`)) return prev;
      return [...prev, {
        id: `q-${q.id}`, role: "ai", messageType: "question_ask",
        content: q.question, sequence: prev.length + 1,
        createdAt: new Date().toISOString(),
        extra: { questionType: q.questionType, questionNumber: idx + 1, totalQuestions: questionArr.length },
      }];
    });
  }

  async function triggerRetrieval() {
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3);
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      setSession(prev => ({ ...prev, status: "retrieval" }));
      setPhase("retrieval");
      // Inject first question as chat bubble
      injectQuestionBubble(arr, 0);
    } finally {
      setAiWorking(false);
    }
  }

  async function handleStartRetrieval() {
    setAiWorking(true);
    setError(null);
    try { await triggerRetrieval(); }
    catch (err) { setError(err.message || "Failed to generate questions."); setAiWorking(false); }
  }

  async function handleSubmitAnswer() {
    if (!answerInput.trim() || submitting) return;
    const question = questions[qIndex];
    if (!question) return;
    setSubmitting(true);
    setError(null);

    // Add the question as an AI chat bubble (if not already in messages)
    const qAlreadyInMessages = messages.some(m => m.id === `q-${question.id}`);
    if (!qAlreadyInMessages) {
      setMessages(prev => [...prev, {
        id: `q-${question.id}`, role: "ai", messageType: "question_ask",
        content: question.question, sequence: prev.length + 1,
        createdAt: new Date().toISOString(),
        extra: { questionType: question.questionType, questionNumber: qIndex + 1, totalQuestions: questions.length },
      }]);
    }

    // Add the student's answer as a user bubble immediately
    const studentAnswer = answerInput.trim();
    setMessages(prev => [...prev, {
      id: `ans-${Date.now()}`, role: "student", messageType: "answer",
      content: studentAnswer, sequence: prev.length + 1,
      createdAt: new Date().toISOString(),
    }]);
    setAnswerInput("");

    try {
      const evaluation = await api.submitAnswer(sessionId, question.id, studentAnswer, null);
      setLastEval(evaluation);
      if (evaluation.feedback) {
        setMessages(prev => [...prev, {
          id: `local-eval-${Date.now()}`, role: "ai", messageType: "feedback",
          content: evaluation.feedback, sequence: prev.length + 1,
          createdAt: new Date().toISOString(),
          extra: { score: evaluation.score, understanding: evaluation.understanding, isCorrect: evaluation.isCorrect },
        }]);
      }
      const sess = await api.getAISession(sessionId);
      setSession(sess);
      if (evaluation.needsReteach) {
        setPhase("reteaching");
        await doReteach(evaluation.misconception, evaluation.recommendedStrategy);
      } else if (qIndex < questions.length - 1) {
        setQIndex(prev => prev + 1);
        setLastEval(null);
      } else {
        await doSummary();
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function doReteach(misconception, recommendedStrategy) {
    setAiWorking(true);
    setError(null);
    try {
      const reason = misconception ? `Student misconception: ${misconception}` : "Student answer score below threshold";
      const t = await api.generateAdaptiveReteach(sessionId, reason);
      setTeaching(t);
      if (t?.explanation) {
        setMessages(prev => [...prev, {
          id: `local-reteach-${Date.now()}`, role: "ai", messageType: "reteach",
          content: t.explanation, sequence: prev.length + 1,
          createdAt: new Date().toISOString(), extra: { strategy: t.strategy },
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

  async function handleStudyReteach() {
    // First scroll up to the reteach explanation so the user can read it
    const reteachMsg = document.querySelector('[data-msgtype="reteach"]');
    if (reteachMsg) {
      reteachMsg.scrollIntoView({ behavior: "smooth", block: "start" });
      // Give user 1.5s to see the message before starting the timer flow
      await new Promise(r => setTimeout(r, 1500));
    }
    setAiWorking(true);
    setError(null);
    try {
      const period = await api.startStudyPeriod(sessionId, 240);
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
      setPhase("practice");
      injectQuestionBubble(arr, 0);
    } catch (err) {
      setError(err.message || "Failed to generate practice questions.");
    } finally {
      setAiWorking(false);
    }
  }

  async function doSummary() {
    setAiWorking(true);
    setError(null);
    try {
      const s = await api.generateSessionSummary(sessionId);
      setSummary(s);
      setSession(prev => ({ ...prev, status: "completed" }));
      setPhase("summary");
    } catch (err) {
      setError(err.message || "Failed to generate summary.");
    } finally {
      setAiWorking(false);
    }
  }

  async function handleEndSession() {
    if (!window.confirm("End this session?\n\nYour progress so far will be saved but the session won't be marked as completed.")) return;
    try {
      await api.abandonAISession(sessionId);
      navigate("/app/learn/ai");
    } catch (err) {
      setError(err.message || "Failed to end session.");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const conceptName = session?.conceptName || "Concept";
  const subjectName = session?.subjectName || "";
  const topicName   = session?.topicName   || "";
  const subtitle    = [subjectName, topicName].filter(Boolean).join(" · ");

  if (loading) {
    return (
      <div className="wa-shell">
        <div className="wa-topbar">
          <div className="wa-topbar-avatar skeleton" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-text" style={{ width: 120, height: 14, marginBottom: 5 }} />
            <div className="skeleton skeleton-text" style={{ width: 80, height: 10 }} />
          </div>
        </div>
        <div className="wa-messages">
          {[80, 60, 90, 50].map((w, i) => (
            <div key={i} className={`wa-bubble-wrap ${i % 2 === 0 ? "wa-bubble-wrap--ai" : "wa-bubble-wrap--user"}`}>
              <div className="skeleton" style={{ width: `${w}%`, height: 48, borderRadius: 12 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="wa-shell">
        <div className="wa-messages" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            <p style={{ color: "var(--wa-error)", marginBottom: 20, fontSize: "0.95rem" }}>{error}</p>
            <button className="wa-btn-primary" onClick={() => navigate("/app/learn/ai")}>Back to AI Learning</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "abandoned") {
    return (
      <div className="wa-shell">
        <div className="wa-messages" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            <p style={{ color: "var(--wa-text-muted)", marginBottom: 20 }}>This session was ended early.</p>
            <button className="wa-btn-primary" onClick={() => navigate("/app/learn/ai")}>Back to AI Learning</button>
          </div>
        </div>
      </div>
    );
  }

  const canType = (phase === "teaching" || phase === "reteaching") && !aiWorking;

  return (
    <div className="wa-shell">

      {/* ── Fixed top bar ──────────────────────────────────────────────── */}
      <header className="wa-topbar">
        <button className="wa-back-btn" onClick={() => navigate("/app/learn/ai")} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="wa-topbar-avatar-wrap" aria-hidden="true">
          <TutorAvatar size={38} />
          <span className="wa-online-dot" />
        </div>

        <div className="wa-topbar-info">
          <span className="wa-topbar-name">PeerUp AI Tutor</span>
          <span className="wa-topbar-status">
            {phase === "preparing" ? "Preparing your lesson…" :
             phase === "studying"  ? "Study time — focus!" :
             aiWorking             ? "Thinking…" :
             "Always here to help you learn"}
          </span>
        </div>

        <SessionProgress currentPhase={phase} />

        <button className="wa-end-btn" onClick={handleEndSession}>End</button>
      </header>

      {/* ── Scrollable message area ────────────────────────────────────── */}
      <main className="wa-messages" aria-live="polite" aria-label="Learning conversation">

        {/* Error banner */}
        {error && (
          <div className="wa-error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Message history */}
        {messages
          .filter(m => !["welcome", "system", "timer_start", "timer_end"].includes(m.messageType))
          .map((msg, idx) => (
            <Message
              key={msg.id || idx}
              msg={msg}
              isHidden={phase === "retrieval" && msg.messageType === "teaching"}
            />
          ))
        }

        {/* Typing indicator */}
        {aiWorking && <TypingIndicator />}

        {/* ── Phase panels injected into the chat flow ────────────────── */}

        {phase === "preparing" && (
          <div className="wa-system-card">
            <TutorAvatar size={40} />
            <div>
              <p className="wa-system-card-title">Getting your lesson ready…</p>
              <p className="wa-system-card-body">Your subject, concept, familiarity and goal are being used to prepare your tutor.</p>
            </div>
          </div>
        )}

        {phase === "teaching" && !aiWorking && (
          <TeachingActions onStartStudy={handleStartStudy} onAction={handleTeachingAction} />
        )}

        {phase === "studying" && (
          <StudyTimerPanel
            seconds={timerSeconds}
            totalSeconds={studyPeriod?.durationSeconds || 300}
            paused={timerPaused}
            onTogglePause={toggleTimerPause}
          />
        )}

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
              onNext={qIndex < questions.length - 1 ? () => {
                const nextIdx = qIndex + 1;
                setQIndex(nextIdx);
                setLastEval(null);
                injectQuestionBubble(questions, nextIdx);
              } : null}
              onSummary={doSummary}
              onReteach={() => doReteach(lastEval?.misconception, lastEval?.recommendedStrategy)}
            />
          ) : (
            <div className="wa-action-card">
              <button className="wa-btn-primary" onClick={handleStartRetrieval} disabled={aiWorking}>
                {aiWorking ? "Generating questions…" : "Start Recall Check"}
              </button>
            </div>
          )
        )}

        {phase === "reteaching" && !aiWorking && (
          <ReteachActions
            onStudyAgain={handleStudyReteach}
            onPracticeNow={handlePracticeAfterReteach}
            onAskQuestion={() => inputRef.current?.focus()}
          />
        )}

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
          <div className="wa-system-card">
            <TypingIndicator label="Generating your session summary…" inline />
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </main>

      {/* ── Fixed bottom input bar ─────────────────────────────────────── */}
      <form
        className="wa-input-bar"
        onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
      >
        {/* Quick action chips when in teaching phase */}
        {(phase === "teaching" || phase === "reteaching") && !aiWorking && (
          <div className="wa-quick-chips">
            {[
              { key: "show_example",        label: "Example" },
              { key: "explain_differently", label: "Different approach" },
              { key: "make_simpler",        label: "Simpler" },
              { key: "go_deeper",           label: "More depth" },
              { key: "why",                 label: "Why?" },
              { key: "real_world",          label: "Real world" },
            ].map(a => (
              <button
                key={a.key}
                type="button"
                className="wa-chip"
                onClick={() => handleTeachingAction(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="wa-input-row">
          <input
            ref={inputRef}
            type="text"
            className="wa-input"
            placeholder={
              phase === "studying"                                   ? "Focus time — chat resumes after timer…" :
              phase === "retrieval" || phase === "practice"          ? "Answer the question above…" :
              phase === "summary"                                    ? "Session complete" :
              phase === "preparing"                                  ? "Tutor is getting ready…" :
              "Ask your tutor a question…"
            }
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && canType && (e.preventDefault(), handleSendMessage())}
            disabled={!canType}
            aria-label="Message your tutor"
          />
          <button
            type="submit"
            className="wa-send-btn"
            disabled={!msgInput.trim() || !canType}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Message({ msg, isHidden }) {
  const isAI = msg.role === "ai";
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  if (isHidden) {
    return (
      <div className="wa-bubble-wrap wa-bubble-wrap--ai">
        <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
        <div className="wa-bubble wa-bubble--ai wa-bubble--hidden">
          <span>📖 Teaching content — available after recall check.</span>
          <span className="wa-time">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`wa-bubble-wrap ${isAI ? "wa-bubble-wrap--ai" : "wa-bubble-wrap--user"}`} data-msgtype={msg.messageType}>
      {isAI && <div className="wa-avatar-col"><TutorAvatar size={34} /></div>}
      <div className={`wa-bubble ${isAI ? "wa-bubble--ai" : "wa-bubble--user"}`}>
        {isAI && (
          <span className="wa-bubble-sender">
            {msg.messageType === "reteach"       ? "PeerUp AI · New Approach" :
             msg.messageType === "question_ask"  ? "PeerUp AI · Question" :
             "PeerUp AI"}
          </span>
        )}
        {msg.messageType === "question_ask" && msg.extra && (
          <div className="wa-q-meta-inline">
            <span className="wa-q-badge">Q{msg.extra.questionNumber}/{msg.extra.totalQuestions}</span>
            <span className="wa-q-type">{formatQType(msg.extra.questionType)}</span>
          </div>
        )}
        <RichText content={msg.content} />
        {msg.messageType === "feedback" && msg.extra?.score !== undefined && msg.extra.score !== null && (
          <div className={`wa-eval-badge understanding-${msg.extra.understanding || "partial"}`}>
            {msg.extra.understanding === "strong"  ? "✓ Strong" :
             msg.extra.understanding === "partial" ? "◑ Getting there" : "✗ Needs practice"}
            {" "}· {msg.extra.score}/100
          </div>
        )}
        {msg.extra?.strategy && (
          <span className="wa-strategy">Strategy: {msg.extra.strategy.replace(/_/g, " ")}</span>
        )}
        <span className="wa-time">{time}</span>
      </div>
    </div>
  );
}

function TypingIndicator({ label, inline }) {
  if (inline) return (
    <div className="wa-typing-inline">
      <span /><span /><span />
      {label && <span className="wa-typing-label">{label}</span>}
    </div>
  );
  return (
    <div className="wa-bubble-wrap wa-bubble-wrap--ai">
      <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
      <div className="wa-bubble wa-bubble--ai wa-bubble--typing">
        <span className="wa-bubble-sender">PeerUp AI</span>
        <div className="wa-typing-dots" aria-label={label || "AI is thinking"}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function SessionProgress({ currentPhase }) {
  const steps = [
    { key: "teaching",  label: "Learn" },
    { key: "studying",  label: "Study" },
    { key: "retrieval", label: "Recall" },
    { key: "practice",  label: "Practice" },
    { key: "summary",   label: "Done" },
  ];
  const idx = steps.findIndex(p =>
    currentPhase === p.key || (currentPhase === "reteaching" && p.key === "practice")
  );
  return (
    <div className="wa-progress" aria-label="Session progress">
      {steps.map((s, i) => (
        <div key={s.key} className={`wa-progress-step ${i < idx ? "done" : ""} ${i === idx ? "active" : ""}`} title={s.label}>
          <span className="wa-progress-dot" />
        </div>
      ))}
    </div>
  );
}

function TeachingActions({ onStartStudy, onAction }) {
  return (
    <div className="wa-action-card wa-teaching-actions">
      <button className="wa-btn-primary wa-btn-study" onClick={onStartStudy}>
        📖 Start Study Timer
      </button>
    </div>
  );
}

function StudyTimerPanel({ seconds, totalSeconds, paused, onTogglePause }) {
  const pct          = totalSeconds > 0 ? seconds / totalSeconds : 0;
  const radius       = 54;
  const circumference = 2 * Math.PI * radius;
  const dash         = circumference * pct;
  const isWarning    = seconds > 0 && seconds <= 60;

  return (
    <div className="wa-action-card wa-study-panel">
      <h3 className="wa-study-title">Study this explanation</h3>
      <p className="wa-study-subtitle">Read carefully — recall check starts when the timer ends.</p>
      <div className="wa-timer-wrap">
        <svg className="wa-timer-svg" viewBox="0 0 120 120" aria-label={`${formatTime(seconds)} remaining`}>
          <circle cx="60" cy="60" r={radius} className="wa-timer-track" />
          <circle cx="60" cy="60" r={radius}
            className={`wa-timer-fill ${isWarning ? "warning" : ""}`}
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 60 60)"
            strokeLinecap="round"
          />
        </svg>
        <div className="wa-timer-center">
          <span className={`wa-timer-digits ${isWarning ? "warning" : ""}`}>{formatTime(seconds)}</span>
          {paused && <span className="wa-timer-paused">Paused</span>}
        </div>
      </div>
      {isWarning && seconds > 0 && <p className="wa-study-warn">⏰ Almost done — finish reading above.</p>}
      {seconds === 0    && <p className="wa-study-warn">⏱ Time's up! Transitioning…</p>}
      <button className="wa-btn-secondary" onClick={onTogglePause} style={{ marginTop: 12 }}>
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}

function RetrievalPanel({ question, questionNumber, totalQuestions, answer, setAnswer, onSubmit, submitting, lastEval, onNext, onSummary, onReteach }) {
  if (!question) return null;
  const showResult = !!lastEval;
  // If there's a result to show, display the EvalResult action card
  if (showResult) {
    return (
      <div className="wa-action-card wa-retrieval-panel">
        <EvalResult eval={lastEval} hasNext={!!onNext} onNext={onNext} onSummary={onSummary} onReteach={onReteach} />
      </div>
    );
  }
  // Otherwise show the answer input (question is already in the chat as a bubble)
  return (
    <div className="wa-action-card wa-retrieval-panel">
      {question.questionType === "multiple_choice" && question.options?.length > 0 ? (
        <div className="wa-mc-options" role="radiogroup" aria-label="Choose your answer">
          {question.options.map(opt => (
            <button key={opt.label} role="radio" aria-checked={answer === opt.label}
              className={`wa-mc-btn ${answer === opt.label ? "selected" : ""}`}
              onClick={() => setAnswer(opt.label)}>
              <span className="wa-mc-label">{opt.label}</span>
              <span className="wa-mc-text">{opt.text}</span>
            </button>
          ))}
        </div>
      ) : (
        <textarea className="wa-answer-input" placeholder="Type your answer here…"
          value={answer} onChange={e => setAnswer(e.target.value)}
          rows={3} disabled={submitting} aria-label="Your answer" />
      )}
      <button className="wa-btn-primary" onClick={onSubmit} disabled={!answer.trim() || submitting}>
        {submitting ? "Checking…" : "Submit Answer"}
      </button>
    </div>
  );
}

function EvalResult({ eval: ev, hasNext, onNext, onSummary, onReteach }) {
  const u = ev?.understanding || "partial";
  return (
    <div className="wa-eval-result">
      <div className={`wa-eval-tag understanding-${u}`}>
        {u === "strong" ? "✓ Strong understanding" : u === "partial" ? "◑ Getting there" : "✗ Let's try again"}
        {ev?.score != null ? ` · ${ev.score}/100` : ""}
      </div>
      {ev?.misconception && (
        <p className="wa-eval-misconception">💡 <strong>Misconception:</strong> {ev.misconception}</p>
      )}
      <div className="wa-eval-actions">
        {ev?.needsReteach ? (
          <button className="wa-btn-primary" onClick={onReteach}>Try a different approach</button>
        ) : hasNext ? (
          <button className="wa-btn-primary" onClick={onNext}>Next Question →</button>
        ) : (
          <button className="wa-btn-primary" onClick={onSummary}>View Session Summary</button>
        )}
      </div>
    </div>
  );
}

function ReteachActions({ onStudyAgain, onPracticeNow, onAskQuestion }) {
  return (
    <div className="wa-action-card">
      <p className="wa-action-hint">A fresh explanation is above. What would you like to do?</p>
      <div className="wa-action-btns">
        <button className="wa-btn-primary"   onClick={onStudyAgain}>📖 Study this explanation</button>
        <button className="wa-btn-secondary" onClick={onPracticeNow}>✅ Try practice questions</button>
        <button className="wa-chip"          onClick={onAskQuestion}>💬 Ask a question</button>
      </div>
    </div>
  );
}

function SummaryPanel({ summary, conceptName, onContinue, onPracticeAgain, onBackToTopic }) {
  return (
    <div className="wa-action-card wa-summary-panel">
      <div className="wa-summary-header">
        <span className="wa-summary-icon">🎓</span>
        <h2>Session Complete</h2>
        <p>{conceptName}</p>
      </div>
      {summary.overallScore != null && (
        <div className="wa-score-block">
          <span className="wa-score-num" style={{
            color: summary.overallScore >= 70 ? "var(--wa-success)" :
                   summary.overallScore >= 50 ? "var(--wa-warning)" : "var(--wa-error)"
          }}>{summary.overallScore}</span>
          <span className="wa-score-denom">/100</span>
          <p className="wa-score-sub">{summary.questionsCorrect} of {summary.questionsAnswered} correct
            {summary.reteachCount > 0 ? ` · ${summary.reteachCount} reteach round${summary.reteachCount > 1 ? "s" : ""}` : ""}
          </p>
        </div>
      )}
      {summary.summaryText && (
        <div className="wa-summary-section">
          <h3>What you learned</h3>
          <p>{summary.summaryText}</p>
        </div>
      )}
      {summary.strengths?.length > 0 && (
        <div className="wa-summary-section">
          <h3>✓ Understood well</h3>
          <ul>{summary.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {summary.areasForPractice?.length > 0 && (
        <div className="wa-summary-section">
          <h3>📝 Needs more practice</h3>
          <ul>{summary.areasForPractice.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}
      {summary.keyIdeas?.length > 0 && (
        <div className="wa-summary-section">
          <h3>💡 Key ideas</h3>
          <ul>{summary.keyIdeas.map((k, i) => <li key={i}>{k}</li>)}</ul>
        </div>
      )}
      {summary.recommendedNext && (
        <div className="wa-summary-section">
          <h3>→ Recommended next step</h3>
          <p>{summary.recommendedNext}</p>
        </div>
      )}
      <div className="wa-action-btns" style={{ marginTop: 20 }}>
        <button className="wa-btn-primary"   onClick={onContinue}>Continue Learning</button>
        <button className="wa-btn-secondary" onClick={onPracticeAgain}>Practice Again</button>
        <button className="wa-chip"          onClick={onBackToTopic}>Back to Topic</button>
      </div>
    </div>
  );
}

// ── Math / rich text ──────────────────────────────────────────────────────────

function KatexBlock({ src }) {
  let html = src;
  try { if (window.__katex__) html = window.__katex__.renderToString(src, { displayMode: true, throwOnError: false }); } catch {}
  return window.__katex__
    ? <div className="wa-math-block" dangerouslySetInnerHTML={{ __html: html }} />
    : <div className="wa-math-block"><code>{src}</code></div>;
}

function KatexInline({ src }) {
  let html = src;
  try { if (window.__katex__) html = window.__katex__.renderToString(src, { displayMode: false, throwOnError: false }); } catch {}
  return window.__katex__
    ? <span className="wa-math-inline" dangerouslySetInnerHTML={{ __html: html }} />
    : <code className="wa-math-inline">{src}</code>;
}

function normalizeMarkdown(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\n(#{1,3} )/g, "$1\n\n$2")
    .replace(/([^\n])\n(> )/g, "$1\n\n$2")
    .replace(/([^\n])\n([-*] )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\d+\. )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\$\$)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function RichText({ content }) {
  if (!content) return null;
  const blocks = normalizeMarkdown(content).split(/\n\n+/);
  return (
    <div className="wa-rich">
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const inner = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return <pre key={i} className="wa-code-block"><code>{inner}</code></pre>;
        }
        const mathBlock = block.match(/^\$\$\n?([\s\S]+?)\n?\$\$$/);
        if (mathBlock) return <KatexBlock key={i} src={mathBlock[1].trim()} />;
        const lines = block.split("\n");
        const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const Tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
          const rest = lines.slice(1).join("\n").trim();
          return <div key={i}><Tag className={`wa-h${level}`}>{renderInline(headingMatch[2])}</Tag>{rest && <RichText content={rest} />}</div>;
        }
        if (lines.every(l => l.trim() === "" || l.trim().startsWith(">"))) {
          return <blockquote key={i} className="wa-blockquote">{lines.filter(l => l.trim().startsWith(">")).map((l, j) => <p key={j}>{renderInline(l.trim().replace(/^>\s?/, ""))}</p>)}</blockquote>;
        }
        if (lines.every(l => l.trim() === "" || /^[-*]\s/.test(l.trim()))) {
          return <ul key={i} className="wa-list">{lines.filter(l => /^[-*]\s/.test(l.trim())).map((l, j) => <li key={j}>{renderInline(l.trim().replace(/^[-*]\s/, ""))}</li>)}</ul>;
        }
        if (lines.every(l => l.trim() === "" || /^\d+\.\s/.test(l.trim()))) {
          return <ol key={i} className="wa-list wa-list-ol">{lines.filter(l => /^\d+\.\s/.test(l.trim())).map((l, j) => <li key={j}>{renderInline(l.trim().replace(/^\d+\.\s/, ""))}</li>)}</ol>;
        }
        if (/^---+$/.test(block.trim())) return <hr key={i} className="wa-divider" />;
        return <p key={i}>{renderInline(block)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  if (!text) return null;
  const cleaned = text.replace(/(\$[^$\n]+\$)\*/g, "$1");
  const parts = cleaned.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\$[^$\n]+\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*")  && part.endsWith("*"))  return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`")  && part.endsWith("`"))  return <code key={i} className="wa-code-inline">{part.slice(1, -1)}</code>;
    if (part.startsWith("$")  && part.endsWith("$"))  return <KatexInline key={i} src={part.slice(1, -1)} />;
    return part;
  });
}

// ── Icons & utils ─────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatQType(t) {
  return { short_answer: "Short answer", multiple_choice: "Multiple choice", calculation: "Calculation", explanation: "Explain in your own words", true_false: "True / False", application: "Application" }[t] || t;
}
