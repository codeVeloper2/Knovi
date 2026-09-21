/**
 * AILearningRoom — WhatsApp-style fullscreen AI chat.
 *
 * New in this version:
 *  - Task list: AI generates 3-5 tasks on load. Each task drives one teach→quiz cycle.
 *  - Clock SVG timer (analog clock face, ticking second hand).
 *  - Questions rendered inline as chat bubbles, NOT as a card panel.
 *  - reteaching→reteaching supported (backend fix applied too).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";
import { TutorAvatar } from "./AISessionSetup";

// ─────────────────────────────────────────────────────────────────────────────
// STATUS → PHASE
// ─────────────────────────────────────────────────────────────────────────────
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
    default:           return "preparing";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading,     setLoading]     = useState(true);
  const [session,     setSession]     = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [phase,       setPhase]       = useState("preparing");
  const [error,       setError]       = useState(null);
  const [aiWorking,   setAiWorking]   = useState(false);
  const [msgInput,    setMsgInput]    = useState("");

  // Task list state
  const [tasks,       setTasks]       = useState([]);
  const [currentTask, setCurrentTask] = useState(0); // index into tasks[]
  const [tasksDone,   setTasksDone]   = useState([]); // task ids completed

  // Study timer
  const [studyPeriod,  setStudyPeriod]  = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerPaused,  setTimerPaused]  = useState(false);
  const timerRef  = useRef(null);
  const pausedRef = useRef(false);

  // Questions (rendered as chat)
  const [questions,   setQuestions]   = useState([]);
  const [qIndex,      setQIndex]      = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [lastEval,    setLastEval]    = useState(null);

  // Summary
  const [summary, setSummary] = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase, aiWorking, lastEval]);

  useEffect(() => {
    loadSession();
    return () => clearTimer();
  }, [sessionId]);

  async function loadSession() {
    setLoading(true);
    setError(null);
    try {
      const [sess, msgs] = await Promise.all([
        api.getAISession(sessionId),
        api.getSessionMessages(sessionId),
      ]);
      applyServerState(sess, msgs);

      // Generate task list if not already loaded from session messages
      const taskMsg = msgs.find(m => m.messageType === "task_list");
      if (taskMsg?.extra?.tasks) {
        setTasks(taskMsg.extra.tasks);
      } else if (sess.status === "created") {
        await prepareSession(sess);
      } else {
        // Try to load from server
        try {
          const t = await api.generateTaskList(sessionId);
          if (Array.isArray(t) && t.length) setTasks(t);
        } catch { /* tasks optional */ }
      }
    } catch (err) {
      setError(err.message || "Failed to load session.");
    } finally {
      setLoading(false);
    }
  }

  async function prepareSession(sess) {
    setAiWorking(true);
    setPhase("preparing");
    setError(null);
    try {
      // Generate tasks and teaching content in parallel
      const [taskResult] = await Promise.allSettled([
        api.generateTaskList(sessionId),
      ]);
      if (taskResult.status === "fulfilled" && Array.isArray(taskResult.value)) {
        setTasks(taskResult.value);
      }
      await api.prepareAISession(sessionId);
      const [freshSess, freshMsgs] = await Promise.all([
        api.getAISession(sessionId),
        api.getSessionMessages(sessionId),
      ]);
      applyServerState(freshSess, freshMsgs);
    } catch (err) {
      setError(err.message || "Could not prepare session.");
    } finally {
      setAiWorking(false);
    }
  }

  function applyServerState(sess, msgs) {
    setSession(sess);
    setMessages(msgs || []);
    const hasTeaching = (msgs || []).some(m => m.messageType === "teaching" || m.messageType === "reteach");
    setPhase(serverStatusToPhase(sess.status, hasTeaching));
    if (sess.summary) setSummary(sess.summary);
    if (sess.activeStudyPeriod && sess.status === "studying") {
      const rem = sess.activeStudyPeriod.remainingSeconds ?? 0;
      setStudyPeriod(sess.activeStudyPeriod);
      if (rem > 0) startTimer(rem, sess.activeStudyPeriod.id);
      else handleTimerExpired(sess.activeStudyPeriod.id);
    }
    if ((sess.status === "retrieval" || sess.status === "practice") && sess.questions?.length > 0) {
      setQuestions(sess.questions);
      setQIndex(0);
    }
    // Restore completed tasks from summary/score
    if (sess.summary && tasks.length > 0) {
      setTasksDone(tasks.map(t => t.id));
    }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────
  function startTimer(seconds, periodId) {
    clearTimer();
    setTimerSeconds(seconds);
    pausedRef.current = false;
    setTimerPaused(false);
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setTimerSeconds(prev => {
        if (prev <= 1) { clearTimer(); handleTimerExpired(periodId); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setTimerPaused(pausedRef.current);
  }

  async function handleTimerExpired(periodId) {
    clearTimer();
    try {
      await api.finishStudyPeriod(sessionId, periodId);
      const [sess, msgs] = await Promise.all([api.getAISession(sessionId), api.getSessionMessages(sessionId)]);
      applyServerState(sess, msgs);
      // Generate questions after timer expires
      await startRetrieval();
    } catch (err) {
      setError(err.message);
      loadSession();
    }
  }

  // ── Teaching ───────────────────────────────────────────────────────────────
  async function handleStartStudy() {
    setAiWorking(true);
    setError(null);
    try {
      const period = await api.startStudyPeriod(sessionId, 600); // 10 min max
      setStudyPeriod(period);
      setPhase("studying");
      startTimer(period.durationSeconds, period.id);
    } catch (err) { setError(err.message); }
    finally { setAiWorking(false); }
  }

  async function handleSendMessage(text) {
    const content = (text || msgInput).trim();
    if (!content || aiWorking) return;
    setMsgInput("");
    setAiWorking(true);
    setError(null);
    addLocalMessage({ role: "student", messageType: "question", content });
    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      setMessages(prev => [...prev, msg]);
    } catch (err) { setError(err.message); }
    finally { setAiWorking(false); }
  }

  async function handleTeachingAction(action) {
    const labels = {
      show_example:        "Can you show me a concrete example?",
      explain_differently: "Can you explain this using a different approach?",
      make_simpler:        "Can you explain this more simply?",
      go_deeper:           "Can you go into more depth on this?",
      why:                 "Why does this work this way?",
      real_world:          "Can you give me a real-world example of this?",
    };
    await handleSendMessage(labels[action] || action);
  }

  // ── Retrieval / Questions as chat ──────────────────────────────────────────
  async function startRetrieval() {
    setAiWorking(true);
    setError(null);
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3);
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      setPhase("retrieval");
      // Inject question as an AI message in chat
      if (arr.length > 0) injectQuestionMessage(arr[0], 1, arr.length);
    } catch (err) { setError(err.message); }
    finally { setAiWorking(false); }
  }

  function injectQuestionMessage(q, num, total) {
    if (!q) return;
    addLocalMessage({
      role: "ai",
      messageType: "question_prompt",
      content: q.question,
      extra: { questionId: q.id, questionType: q.questionType || q.question_type, options: q.options, num, total },
    });
  }

  async function handleSubmitAnswer() {
    const question = questions[qIndex];
    if (!question || (!answerInput.trim()) || submitting) return;
    setSubmitting(true);
    setError(null);

    // Show student answer in chat
    addLocalMessage({ role: "student", messageType: "answer", content: answerInput.trim() });
    const submitted = answerInput.trim();
    setAnswerInput("");

    try {
      const evaluation = await api.submitAnswer(sessionId, question.id, submitted, null);
      setLastEval(evaluation);

      // Show AI feedback as a chat message
      if (evaluation.feedback) {
        addLocalMessage({
          role: "ai",
          messageType: "feedback",
          content: evaluation.feedback,
          extra: { score: evaluation.score, understanding: evaluation.understanding, isCorrect: evaluation.isCorrect },
        });
      }

      const sess = await api.getAISession(sessionId);
      setSession(sess);

      if (evaluation.needsReteach) {
        // Reteach
        setPhase("reteaching");
        await doReteach(evaluation.misconception, evaluation.recommendedStrategy);
      } else if (qIndex < questions.length - 1) {
        // Next question
        const nextIdx = qIndex + 1;
        setQIndex(nextIdx);
        setLastEval(null);
        injectQuestionMessage(questions[nextIdx], nextIdx + 1, questions.length);
      } else {
        // All questions done — mark task done and move to next or summarize
        await finishCurrentTask();
      }
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  async function finishCurrentTask() {
    // Mark current task complete
    const task = tasks[currentTask];
    if (task) {
      setTasksDone(prev => [...prev, task.id]);
    }

    const nextTaskIdx = currentTask + 1;
    if (nextTaskIdx < tasks.length) {
      // Move to next task — teach it
      setCurrentTask(nextTaskIdx);
      setPhase("teaching");
      setQIndex(0);
      setLastEval(null);
      setAiWorking(true);
      // Announce next task
      addLocalMessage({
        role: "ai",
        messageType: "task_transition",
        content: `✅ Great work! Task ${currentTask + 1} complete.\n\nMoving to **Task ${nextTaskIdx + 1}: ${tasks[nextTaskIdx]?.title}**.`,
        extra: { taskIndex: nextTaskIdx },
      });
      try {
        const t = await api.teachConcept(sessionId);
        if (t?.explanation) {
          addLocalMessage({ role: "ai", messageType: "teaching", content: t.explanation, extra: { strategy: t.strategy } });
        }
      } catch (err) { setError(err.message); }
      finally { setAiWorking(false); }
    } else {
      // All tasks done — generate summary
      await doSummary();
    }
  }

  async function doReteach(misconception, strategy) {
    setAiWorking(true);
    setError(null);
    try {
      const reason = misconception ? `Misconception: ${misconception}` : "Student answer below threshold";
      const t = await api.generateAdaptiveReteach(sessionId, reason);
      if (t?.explanation) {
        addLocalMessage({ role: "ai", messageType: "reteach", content: t.explanation, extra: { strategy: t.strategy } });
      }
      // After reteach, re-ask the same question
      setLastEval(null);
      injectQuestionMessage(questions[qIndex], qIndex + 1, questions.length);
    } catch (err) { setError(err.message); }
    finally { setAiWorking(false); }
  }

  async function doSummary() {
    setAiWorking(true);
    setError(null);
    try {
      const s = await api.generateSessionSummary(sessionId);
      setSummary(s);
      setPhase("summary");
    } catch (err) { setError(err.message); }
    finally { setAiWorking(false); }
  }

  async function handleEndSession() {
    if (!window.confirm("End this session? Progress so far will be saved.")) return;
    try {
      await api.abandonAISession(sessionId);
      navigate("/app/learn/ai");
    } catch (err) { setError(err.message); }
  }

  function addLocalMessage(partial) {
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
      sequence: prev.length + 1,
      ...partial,
    }]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED VALUES
  // ─────────────────────────────────────────────────────────────────────────
  const conceptName = session?.conceptName || "Concept";
  const canType = (phase === "teaching" || phase === "reteaching") && !aiWorking;
  const activeTask = tasks[currentTask];

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="wa-shell">
      <div className="wa-topbar">
        <div className="wa-topbar-avatar-wrap"><TutorAvatar size={38} /></div>
        <div className="wa-topbar-info">
          <span className="wa-topbar-name">PeerUp AI Tutor</span>
          <span className="wa-topbar-status">Loading session…</span>
        </div>
      </div>
      <div className="wa-messages" style={{ justifyContent: "center", alignItems: "center" }}>
        <TypingIndicator />
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="wa-shell">

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
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
          <span className="wa-topbar-name">UPRAD</span>
          <span className="wa-topbar-status">
            {aiWorking ? "Thinking…" : phase === "studying" ? "Study time — focus!" : "Always here to help you learn"}
          </span>
        </div>

        {/* Task progress dots */}
        {tasks.length > 0 && (
          <div className="wa-task-dots" aria-label="Task progress">
            {tasks.map((t, i) => (
              <span key={t.id}
                className={`wa-task-dot ${tasksDone.includes(t.id) ? "done" : ""} ${i === currentTask && !tasksDone.includes(t.id) ? "active" : ""}`}
                title={t.title}
              />
            ))}
          </div>
        )}

        <button className="wa-end-btn" onClick={handleEndSession}>End</button>
      </header>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <main className="wa-messages" aria-live="polite">

        {error && (
          <div className="wa-error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Task list sidebar shown at top of chat when tasks exist */}
        {tasks.length > 0 && phase !== "summary" && (
          <TaskListBanner tasks={tasks} currentTask={currentTask} tasksDone={tasksDone} />
        )}

        {/* Messages */}
        {messages
          .filter(m => !["welcome", "system", "timer_start", "timer_end", "task_list"].includes(m.messageType))
          .map((msg, idx) => (
            <ChatMessage
              key={msg.id || idx}
              msg={msg}
              hidden={phase === "retrieval" && msg.messageType === "teaching"}
              currentQuestion={phase === "retrieval" || phase === "practice" ? questions[qIndex] : null}
              answerInput={answerInput}
              setAnswerInput={setAnswerInput}
              onSubmit={handleSubmitAnswer}
              submitting={submitting}
            />
          ))
        }

        {aiWorking && <TypingIndicator />}

        {/* Phase panels */}
        {phase === "preparing" && !aiWorking && (
          <AIBubble>
            <p style={{ margin: 0, color: "var(--wa-text-muted)" }}>Getting your lesson ready…</p>
          </AIBubble>
        )}

        {phase === "teaching" && !aiWorking && (
          <div className="wa-action-card wa-teaching-actions">
            {activeTask && (
              <div className="wa-task-badge">
                📋 Task {currentTask + 1} of {tasks.length}: <strong>{activeTask.title}</strong>
              </div>
            )}
            <button className="wa-btn-primary wa-btn-study" onClick={handleStartStudy} disabled={aiWorking}>
              📖 Start Study Timer
            </button>
          </div>
        )}

        {phase === "studying" && studyPeriod && (
          <div className="wa-action-card wa-study-panel">
            <h3 className="wa-study-title">Study this explanation</h3>
            <p className="wa-study-subtitle">The recall check starts when the timer ends.</p>
            <ClockTimer
              seconds={timerSeconds}
              totalSeconds={studyPeriod.durationSeconds}
              paused={timerPaused}
              onTogglePause={togglePause}
            />
            {timerSeconds <= 60 && timerSeconds > 0 && (
              <p className="wa-study-warn">⏰ Almost done — finish reading.</p>
            )}
          </div>
        )}

        {phase === "reteaching" && !aiWorking && (
          <div className="wa-action-card">
            <p className="wa-action-hint">A fresh explanation is above. What would you like to do?</p>
            <div className="wa-action-btns">
              <button className="wa-btn-primary" onClick={handleStartStudy}>📖 Study this explanation</button>
              <button className="wa-btn-secondary" onClick={() => {
                setPhase("retrieval");
                injectQuestionMessage(questions[qIndex], qIndex + 1, questions.length);
              }}>✅ Try again</button>
              <button className="wa-chip" onClick={() => inputRef.current?.focus()}>💬 Ask a question</button>
            </div>
          </div>
        )}

        {phase === "summary" && summary && (
          <SummaryPanel
            summary={summary}
            conceptName={conceptName}
            tasks={tasks}
            tasksDone={tasksDone}
            onContinue={() => navigate("/app/learn/ai")}
          />
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </main>

      {/* ── Input bar ───────────────────────────────────────────────────── */}
      <form className="wa-input-bar" onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
        {(phase === "teaching" || phase === "reteaching") && !aiWorking && (
          <div className="wa-quick-chips">
            {[
              { key: "show_example", label: "Example" },
              { key: "explain_differently", label: "Different approach" },
              { key: "make_simpler", label: "Simpler" },
              { key: "go_deeper", label: "More depth" },
              { key: "why", label: "Why?" },
              { key: "real_world", label: "Real world" },
            ].map(a => (
              <button key={a.key} type="button" className="wa-chip" onClick={() => handleTeachingAction(a.key)}>
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
              phase === "studying"  ? "Study time — focus on reading above…" :
              phase === "retrieval" || phase === "practice" ? "Type your answer above…" :
              phase === "summary"   ? "Session complete" :
              phase === "preparing" ? "Tutor is getting ready…" :
              "Ask your tutor a question…"
            }
            value={msgInput}
            onChange={e => setMsgInput(e.target.value)}
            disabled={!canType}
          />
          <button type="submit" className="wa-send-btn" disabled={!msgInput.trim() || !canType} aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT MESSAGE — handles all message types inline
// ─────────────────────────────────────────────────────────────────────────────
function ChatMessage({ msg, hidden, currentQuestion, answerInput, setAnswerInput, onSubmit, submitting }) {
  const isAI = msg.role === "ai";
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  // Teaching content hidden during recall
  if (hidden) return (
    <div className="wa-bubble-wrap wa-bubble-wrap--ai">
      <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
      <div className="wa-bubble wa-bubble--ai wa-bubble--hidden">
        <span className="wa-bubble-sender">UPRAD</span>
        <span>📖 Teaching content — visible after recall check.</span>
        <span className="wa-time">{time}</span>
      </div>
    </div>
  );

  // Question prompt — AI asks question, student answers inline
  if (msg.messageType === "question_prompt") {
    const qnum  = msg.extra?.num || 1;
    const qtotal = msg.extra?.total || 1;
    const qtype  = msg.extra?.questionType;
    const opts   = msg.extra?.options;
    const isActive = currentQuestion && currentQuestion.id === msg.extra?.questionId;

    return (
      <div className="wa-bubble-wrap wa-bubble-wrap--ai">
        <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
        <div className="wa-bubble wa-bubble--ai wa-bubble--question">
          <span className="wa-bubble-sender">UPRAD · QUESTION</span>
          <div className="wa-q-header">
            <span className="wa-q-badge">Q{qnum}/{qtotal}</span>
            <span className="wa-q-type">{formatQType(qtype)}</span>
          </div>
          <p className="wa-q-text">{msg.content}</p>
          {isActive && (
            opts && opts.length > 0 ? (
              <div className="wa-mc-options">
                {opts.map(opt => (
                  <button key={opt.label}
                    className={`wa-mc-btn ${answerInput === opt.label ? "selected" : ""}`}
                    onClick={() => setAnswerInput(opt.label)}
                    disabled={submitting}
                  >
                    <span className="wa-mc-label">{opt.label}</span>
                    <span className="wa-mc-text">{opt.text}</span>
                  </button>
                ))}
                <button className="wa-btn-primary" onClick={onSubmit} disabled={!answerInput || submitting} style={{ marginTop: 10 }}>
                  {submitting ? "Checking…" : "Submit"}
                </button>
              </div>
            ) : (
              <div className="wa-inline-answer">
                <textarea
                  className="wa-answer-input"
                  placeholder="Type your answer…"
                  value={answerInput}
                  onChange={e => setAnswerInput(e.target.value)}
                  rows={2}
                  disabled={submitting}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && !submitting && answerInput.trim()) {
                      e.preventDefault();
                      onSubmit();
                    }
                  }}
                />
                <button className="wa-send-btn" onClick={onSubmit} disabled={!answerInput.trim() || submitting} aria-label="Submit answer">
                  <SendIcon />
                </button>
              </div>
            )
          )}
          <span className="wa-time">{time}</span>
        </div>
      </div>
    );
  }

  // Task transition
  if (msg.messageType === "task_transition") return (
    <div className="wa-bubble-wrap wa-bubble-wrap--ai">
      <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
      <div className="wa-bubble wa-bubble--ai wa-bubble--task-transition">
        <span className="wa-bubble-sender">UPRAD</span>
        <RichText content={msg.content} />
        <span className="wa-time">{time}</span>
      </div>
    </div>
  );

  // Standard AI or student bubble
  return (
    <div className={`wa-bubble-wrap ${isAI ? "wa-bubble-wrap--ai" : "wa-bubble-wrap--user"}`}>
      {isAI && <div className="wa-avatar-col"><TutorAvatar size={34} /></div>}
      <div className={`wa-bubble ${isAI ? "wa-bubble--ai" : "wa-bubble--user"}`}>
        {isAI && (
          <span className="wa-bubble-sender">
            {msg.messageType === "reteach" ? "UPRAD · NEW APPROACH" : "UPRAD"}
          </span>
        )}
        <RichText content={msg.content} />
        {msg.messageType === "feedback" && msg.extra?.score !== undefined && (
          <div className={`wa-eval-badge understanding-${msg.extra.understanding || "partial"}`}>
            {msg.extra.understanding === "strong" ? "✓ Strong" : msg.extra.understanding === "partial" ? "◑ Getting there" : "✗ Needs practice"}
            {" "}· {msg.extra.score}/100
          </div>
        )}
        {msg.extra?.strategy && msg.messageType !== "feedback" && (
          <span className="wa-strategy">Strategy: {msg.extra.strategy.replace(/_/g, " ")}</span>
        )}
        <span className="wa-time">{time}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK LIST BANNER
// ─────────────────────────────────────────────────────────────────────────────
function TaskListBanner({ tasks, currentTask, tasksDone }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="wa-task-banner">
      <button className="wa-task-banner-toggle" onClick={() => setCollapsed(c => !c)}>
        <span>📋 Learning Tasks ({tasksDone.length}/{tasks.length} done)</span>
        <span>{collapsed ? "▾" : "▴"}</span>
      </button>
      {!collapsed && (
        <ol className="wa-task-list">
          {tasks.map((t, i) => (
            <li key={t.id} className={`wa-task-item ${tasksDone.includes(t.id) ? "done" : ""} ${i === currentTask && !tasksDone.includes(t.id) ? "active" : ""}`}>
              <span className="wa-task-check">{tasksDone.includes(t.id) ? "✓" : i === currentTask ? "●" : "○"}</span>
              <div>
                <strong>{t.title}</strong>
                <p>{t.description}</p>
                <span className="wa-task-time">~{t.estimated_minutes} min</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLOCK SVG TIMER
// ─────────────────────────────────────────────────────────────────────────────
function ClockTimer({ seconds, totalSeconds, paused, onTogglePause }) {
  const pct = totalSeconds > 0 ? (totalSeconds - seconds) / totalSeconds : 0;
  const isWarning = seconds > 0 && seconds <= 60;

  // Clock hand angles
  const totalMinutes = totalSeconds / 60;
  const elapsedMinutes = (totalSeconds - seconds) / 60;
  const secondAngle = ((totalSeconds - seconds) % 60) / 60 * 360;
  const minuteAngle = elapsedMinutes / Math.max(totalMinutes, 1) * 360;

  // Progress arc
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = circ * pct;

  return (
    <div className="wa-clock-wrap">
      <svg className="wa-clock-svg" viewBox="0 0 140 140" aria-label={`${formatTime(seconds)} remaining`}>
        {/* Clock face */}
        <circle cx="70" cy="70" r="65" className="wa-clock-face" />
        {/* Tick marks */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
          const r1 = 57, r2 = 63;
          return <line key={i}
            x1={70 + r1 * Math.cos(a)} y1={70 + r1 * Math.sin(a)}
            x2={70 + r2 * Math.cos(a)} y2={70 + r2 * Math.sin(a)}
            className="wa-clock-tick"
          />;
        })}
        {/* Progress arc (elapsed time fills red/primary) */}
        <circle cx="70" cy="70" r={r}
          className={`wa-clock-arc ${isWarning ? "warning" : ""}`}
          strokeDasharray={`${filled} ${circ}`}
          transform="rotate(-90 70 70)"
          strokeLinecap="round"
          fill="none"
        />
        {/* Minute hand */}
        <line
          x1="70" y1="70"
          x2={70 + 38 * Math.sin(minuteAngle * Math.PI / 180)}
          y2={70 - 38 * Math.cos(minuteAngle * Math.PI / 180)}
          className="wa-clock-minute-hand"
          strokeLinecap="round"
        />
        {/* Second hand */}
        <line
          x1="70" y1="70"
          x2={70 + 48 * Math.sin(secondAngle * Math.PI / 180)}
          y2={70 - 48 * Math.cos(secondAngle * Math.PI / 180)}
          className={`wa-clock-second-hand ${isWarning ? "warning" : ""}`}
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx="70" cy="70" r="4" className="wa-clock-center" />
        {/* Time display */}
        <text x="70" y="103" className={`wa-clock-digits ${isWarning ? "warning" : ""}`} textAnchor="middle">
          {formatTime(seconds)}
        </text>
        {paused && <text x="70" y="116" className="wa-clock-paused" textAnchor="middle">PAUSED</text>}
      </svg>
      <button className="wa-btn-secondary" onClick={onTogglePause} style={{ marginTop: 12 }}>
        {paused ? "▶ Resume" : "⏸ Pause"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SummaryPanel({ summary, conceptName, tasks, tasksDone, onContinue }) {
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
        </div>
      )}
      {tasks.length > 0 && (
        <div className="wa-summary-section">
          <h3>Tasks completed</h3>
          <ul>{tasks.map(t => <li key={t.id}>{tasksDone.includes(t.id) ? "✅" : "⬜"} {t.title}</li>)}</ul>
        </div>
      )}
      {summary.summaryText && <div className="wa-summary-section"><h3>What you learned</h3><p>{summary.summaryText}</p></div>}
      {summary.strengths?.length > 0 && <div className="wa-summary-section"><h3>✓ Strengths</h3><ul>{summary.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
      {summary.areasForPractice?.length > 0 && <div className="wa-summary-section"><h3>📝 Practice more</h3><ul>{summary.areasForPractice.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
      {summary.recommendedNext && <div className="wa-summary-section"><h3>→ Next step</h3><p>{summary.recommendedNext}</p></div>}
      <button className="wa-btn-primary" onClick={onContinue} style={{ marginTop: 16 }}>Continue Learning</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function AIBubble({ children }) {
  return (
    <div className="wa-bubble-wrap wa-bubble-wrap--ai">
      <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
      <div className="wa-bubble wa-bubble--ai">
        <span className="wa-bubble-sender">UPRAD</span>
        {children}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="wa-bubble-wrap wa-bubble-wrap--ai">
      <div className="wa-avatar-col"><TutorAvatar size={34} /></div>
      <div className="wa-bubble wa-bubble--ai wa-bubble--typing">
        <span className="wa-bubble-sender">UPRAD</span>
        <div className="wa-typing-dots" aria-label="AI is thinking">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatQType(t) {
  return { short_answer: "Short answer", multiple_choice: "Multiple choice", calculation: "Calculation", explanation: "Explain", true_false: "True / False", application: "Application" }[t] || (t || "");
}

// ─────────────────────────────────────────────────────────────────────────────
// RICH TEXT (from previous versions)
// ─────────────────────────────────────────────────────────────────────────────
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
  return text.replace(/\r\n/g, "\n")
    .replace(/([^\n])\n(#{1,3} )/g, "$1\n\n$2")
    .replace(/([^\n])\n(> )/g, "$1\n\n$2")
    .replace(/([^\n])\n([-*] )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\d+\. )/g, "$1\n\n$2")
    .replace(/([^\n])\n(\$\$)/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n").trim();
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
        const hm = lines[0].match(/^(#{1,3})\s+(.+)/);
        if (hm) {
          const Tag = hm[1].length === 1 ? "h2" : hm[1].length === 2 ? "h3" : "h4";
          const rest = lines.slice(1).join("\n").trim();
          return <div key={i}><Tag className={`wa-h${hm[1].length}`}>{renderInline(hm[2])}</Tag>{rest && <RichText content={rest} />}</div>;
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
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="wa-code-inline">{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$")) return <KatexInline key={i} src={part.slice(1, -1)} />;
    return part;
  });
}
