/**
 * AI Learning Room — one continuous conversation.
 *
 * The existing learning-session backend remains the source of truth for
 * messages, teaching snapshots, retrieval questions, answers and evaluation.
 * Practice is only a temporary protected state inside that conversation.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { TutorAvatar } from "./AISessionSetup";
import "../../styles/ai-room.css";

function statusToPhase(status, hasMessages) {
  switch (status) {
    case "created": return "preparing";
    case "teaching": return hasMessages ? "teaching" : "preparing";
    case "studying": return "studying";
    case "retrieval":
    case "practice": return "practice";
    case "reteaching": return "reteaching";
    case "completed": return "summary";
    case "abandoned": return "abandoned";
    default: return "teaching";
  }
}

export default function AILearningRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState("preparing");
  const [error, setError] = useState(null);
  const [aiWorking, setAiWorking] = useState(false);

  const [learningPlan, setLearningPlan] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [completedTaskIndexes, setCompletedTaskIndexes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [checkResults, setCheckResults] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [restoreNotice, setRestoreNotice] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const bottomRef = useRef(null);
  const timerRef = useRef(null);
  const ttsRef = useRef(false);

  const conceptName = session?.conceptName || "Learning session";
  const subjectName = session?.subjectName || "AI Learning";
  const topicName = session?.topicName || "";
  const currentQuestion = questions[qIndex] || null;
  const currentTask = learningPlan[currentTaskIndex] || null;
  const completedCount = completedTaskIndexes.length;
  const planProgress = learningPlan.length ? Math.round((completedCount / learningPlan.length) * 100) : 0;
  const teachingLocked = phase === "practice";
  const canType = ["teaching", "reteaching", "summary"].includes(phase) && !aiWorking;
  const answeredCount = Object.keys(checkResults).length;

  const phaseLabel = {
    preparing: "Preparing lesson",
    teaching: "Learning together",
    reteaching: "Learning together",
    studying: "Learning together",
    practice: "Practice mode",
    summary: "Learning complete",
  }[phase] || "Learning";

  useEffect(() => {
    loadSession();
    return () => {
      clearInterval(timerRef.current);
      window.speechSynthesis?.cancel();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!aiWorking) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, phase, currentQuestion?.id]);

  useEffect(() => {
    if (!restoreNotice) return;
    const t = setTimeout(() => setRestoreNotice(false), 4200);
    return () => clearTimeout(t);
  }, [restoreNotice]);

  async function loadSession() {
    setLoading(true);
    setError(null);
    try {
      const sess = await api.getAISession(sessionId);
      let msgs = Array.isArray(sess?.messages) ? sess.messages : [];
      try {
        const serverMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(serverMessages)) msgs = serverMessages;
      } catch {}
      applySession(sess, msgs);
      if (sess.status === "created") await prepareSession();
    } catch (err) {
      setError(err.message || "Could not open this learning room.");
    } finally {
      setLoading(false);
    }
  }

  async function prepareSession() {
    setAiWorking(true);
    setPhase("preparing");
    try {
      await api.prepareAISession(sessionId);
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try {
        const serverMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(serverMessages)) msgs = serverMessages;
      } catch {}
      applySession(fresh, msgs);
      const first = msgs.find(m => m.role === "ai" && m.messageType === "teaching");
      if (first?.content) speak(first.content);
    } catch (err) {
      setError(err.message || "The AI tutor could not prepare this lesson.");
    } finally {
      setAiWorking(false);
    }
  }

  function applySession(sess, msgs) {
    setSession(sess);
    const safe = Array.isArray(msgs) ? msgs : [];
    setMessages(safe);

    const plan = sess?.teaching?.learningPlan || safe.slice().reverse().map(m => m?.extra?.learningPlan).find(p => Array.isArray(p) && p.length) || [];
    if (Array.isArray(plan)) setLearningPlan(plan);

    const timerMsg = safe.filter(m => m?.messageType === "timer_start" && m?.extra?.taskIndex != null).slice(-1)[0];
    if (timerMsg?.extra?.taskIndex != null) setCurrentTaskIndex(Number(timerMsg.extra.taskIndex));

    const nextPhase = statusToPhase(sess?.status, safe.some(m => m.messageType === "teaching" || m.messageType === "reteach"));
    setPhase(nextPhase);

    if (Array.isArray(sess?.answers)) {
      const restored = {};
      const done = [];
      sess.answers.forEach(item => {
        if (item?.questionId != null) restored[Number(item.questionId)] = item;
        if (!item?.needsReteach && item?.taskIndex != null) done.push(Number(item.taskIndex));
      });
      setCheckResults(restored);
      if (done.length) setCompletedTaskIndexes([...new Set(done)]);
    }

    if (["practice", "summary"].includes(nextPhase) && sess?.questions?.length) {
      const qs = sess.questions;
      setQuestions(qs);
      const answered = new Set((sess.answers || []).map(a => Number(a.questionId)));
      const next = qs.findIndex(q => !answered.has(Number(q.id)));
      setQIndex(next === -1 ? Math.max(0, qs.length - 1) : next);
    } else if (nextPhase !== "practice") {
      setQuestions([]);
      setQIndex(0);
      setAnswerInput("");
    }
  }

  function speak(text) {
    if (!ttsRef.current || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = String(text).replace(/```[\s\S]*?```/g, " code ").replace(/[#*_`~>-]+/g, " ").replace(/\s+/g, " ").trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  function toggleTts() {
    const next = !ttsEnabled;
    ttsRef.current = next;
    setTtsEnabled(next);
    if (!next) window.speechSynthesis?.cancel();
  }

  function addLocalMessage(role, content, extra = {}, messageType = "teaching") {
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}-${Math.random()}`,
      role,
      content,
      extra,
      messageType,
      sequence: prev.length + 1,
      createdAt: new Date().toISOString(),
    }]);
  }

  async function sendMessage(raw) {
    const content = (raw || msgInput).trim();
    if (!content || aiWorking || !canType) return;
    setMsgInput("");
    setError(null);
    setAiWorking(true);
    // Optimistically show the learner's message; the backend persists the
    // same message in the existing session message stream.
    addLocalMessage("student", content, {}, "question");
    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      setMessages(prev => [...prev, { ...msg }]);
      speak(msg.content || "");

      // The backend's agentic action is the source of truth. The tutor first
      // asks readiness; only the learner's confirmation starts Practice Mode.
      if (msg.extra?.action === "start_quiz") {
        await beginPractice(msg.extra?.actionData?.task_index ?? currentTaskIndex);
      }
    } catch (err) {
      setError(err.message || "The tutor could not respond.");
    } finally {
      setAiWorking(false);
    }
  }

  async function beginPractice(taskIndex = currentTaskIndex) {
    setAiWorking(true);
    setError(null);
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3, taskIndex);
      const arr = Array.isArray(qs) ? qs : (qs?.questions || []);
      if (!arr.length) throw new Error("The tutor could not prepare a practice check.");

      // Rehydrate the existing conversation from the server. In protected
      // practice state the backend replaces only teaching content with lock
      // placeholders; user messages remain visible.
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try {
        const serverMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(serverMessages)) msgs = serverMessages;
      } catch {}

      setSession(fresh);
      setMessages(msgs);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setPhase("practice");
    } catch (err) {
      setError(err.message || "Could not start practice mode.");
    } finally {
      setAiWorking(false);
    }
  }

  async function submitAnswer() {
    if (!answerInput.trim() || submitting || !currentQuestion) return;
    const answer = answerInput.trim();
    setSubmitting(true);
    setError(null);
    try {
      const evaluation = await api.submitAnswer(sessionId, currentQuestion.id, answer, null);
      const result = {
        ...evaluation,
        questionId: currentQuestion.id,
        studentAnswer: answer,
        question: currentQuestion.question,
        questionType: currentQuestion.questionType,
        options: currentQuestion.options || null,
      };
      setCheckResults(prev => ({ ...prev, [currentQuestion.id]: result }));

      // These entries are persisted by the backend through the existing
      // ai_session_messages stream. Add them immediately for a continuous UI.
      addLocalMessage(
        "student",
        `**Question ${currentQuestion.sequence || qIndex + 1}:** ${currentQuestion.question}\n\n**Answer:** ${answer}`,
        { questionId: currentQuestion.id, practice: true },
        "answer"
      );
      addLocalMessage(
        "ai",
        evaluation.feedback || (evaluation.understanding === "strong" ? "Good understanding. Let’s keep going." : "Let’s slow down and rebuild the idea from a different angle."),
        {
          questionId: currentQuestion.id,
          understanding: evaluation.understanding,
          score: evaluation.score,
          needsReteach: evaluation.needsReteach,
        },
        "feedback"
      );

      const next = qIndex + 1;
      setAnswerInput("");
      if (next < questions.length) {
        setQIndex(next);
        return;
      }

      await finishPracticeRun();
    } catch (err) {
      setError(err.message || "Could not evaluate that answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishPracticeRun() {
    setAiWorking(true);
    try {
      const result = await api.completePracticeRun(sessionId, questions.map(q => q.id));

      // Practice has ended. Restore the canonical conversation before doing
      // anything adaptive. This is deliberately not a page/session reload.
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try {
        const serverMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(serverMessages)) msgs = serverMessages;
      } catch {}
      setSession(fresh);
      setMessages(msgs);
      setPhase("teaching");
      setQuestions([]);
      setQIndex(0);
      setAnswerInput("");
      setRestoreNotice(true);

      if (result?.needsReteach) {
        await reteachAfterPractice();
      } else {
        const doneTask = Number.isInteger(currentTaskIndex) ? currentTaskIndex : 0;
        setCompletedTaskIndexes(prev => [...new Set([...prev, doneTask])]);
        addLocalMessage(
          "ai",
          "✓ Practice complete. Your learning conversation is restored. Nice work — we can keep building from here.",
          { action: "practice_complete", needsReteach: false },
          "agent"
        );
      }
    } catch (err) {
      setError(err.message || "Practice could not be completed.");
    } finally {
      setAiWorking(false);
    }
  }

  async function reteachAfterPractice() {
    try {
      const reason = Object.values(checkResults).filter(r => r?.needsReteach).map(r => r?.misconception).filter(Boolean).slice(-2).join("; ") || "The practice run showed partial understanding.";
      const t = await api.generateAdaptiveReteach(sessionId, reason);
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try {
        const serverMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(serverMessages)) msgs = serverMessages;
      } catch {}
      setSession(fresh);
      setMessages(msgs);
      setPhase("teaching");
      if (t?.explanation) speak(t.explanation);
    } catch (err) {
      setError(err.message || "The tutor could not start adaptive reteaching.");
    }
  }

  async function startStudyMode() {
    setError(null);
    setAiWorking(true);
    try {
      // Existing study architecture is retained as an optional tool, not the
      // primary Learning Room flow.
      const period = await api.startStudyPeriod(sessionId, 300, currentTaskIndex);
      setSession(prev => ({ ...prev, status: "studying" }));
      setPhase("studying");
      setTimerSeconds(Number(period.durationSeconds || 300));
      runTimer(Number(period.durationSeconds || 300), period.id);
    } catch (err) {
      setError(err.message || "Could not start study mode.");
    } finally {
      setAiWorking(false);
    }
  }

  const [timerSeconds, setTimerSeconds] = useState(0);
  function runTimer(seconds, periodId) {
    clearInterval(timerRef.current);
    setTimerSeconds(seconds);
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          api.finishStudyPeriod(sessionId, periodId).then(() => beginPractice(currentTaskIndex)).catch(err => setError(err.message || "Study mode could not finish."));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function endSession() {
    if (!window.confirm("End this session? Your progress will be saved, but the session will not be completed.")) return;
    try {
      await api.abandonAISession(sessionId);
      navigate("/app/learn/ai");
    } catch (err) {
      setError(err.message || "Could not end the session.");
    }
  }

  const quickActions = [
    ["example", "Show an example", "Give me a concrete example of this."],
    ["simpler", "Make it simpler", "Explain this in a simpler way without losing the important idea."],
    ["why", "Why does this work?", "Why does this work this way?"],
    ["apply", "Apply it", "Give me a real-world application of this idea."],
  ];

  if (loading) return <RoomSkeleton />;
  if (error && !session) return <ErrorRoom message={error} onBack={() => navigate("/app/learn/ai")} />;
  if (phase === "abandoned") return <ErrorRoom message="This learning session was ended early." onBack={() => navigate("/app/learn/ai")} />;

  return (
    <div className="ar-room">
      <header className="ar-header">
        <div className="ar-header-left">
          <button className="ar-icon-btn" onClick={() => navigate("/app/learn/ai")} aria-label="Back to AI Learning">←</button>
          <div className="ar-brand-avatar"><TutorAvatar size={34} /><span /></div>
          <div className="ar-header-copy">
            <div className="ar-header-title">{conceptName}</div>
            <div className="ar-header-sub">{subjectName}{topicName ? ` · ${topicName}` : ""}</div>
          </div>
        </div>
        <div className="ar-header-center"><span className="ar-live-dot" /><span>{aiWorking ? "UPRAD is working…" : phaseLabel}</span></div>
        <div className="ar-header-right">
          <button className={`ar-icon-btn ar-voice ${ttsEnabled ? "active" : ""}`} onClick={toggleTts} title="Tutor voice" aria-label="Toggle tutor voice">{ttsEnabled ? "◖)" : "◖"}</button>
          <button className="ar-header-action ar-desktop-toggle" onClick={() => setLeftOpen(v => !v)}>{leftOpen ? "Hide plan" : "Show plan"}</button>
          <button className="ar-header-action ar-desktop-toggle" onClick={() => setRightOpen(v => !v)}>{rightOpen ? "Hide tools" : "Show tools"}</button>
          <button className="ar-header-action ar-mobile-only" onClick={() => setMobilePanel("plan")}>Plan</button>
          <button className="ar-header-action ar-mobile-only" onClick={() => setMobilePanel("tools")}>Tools</button>
          <button className="ar-end" onClick={endSession}>End</button>
        </div>
      </header>

      <div className={`ar-layout ${leftOpen ? "ar-left-open" : "ar-left-collapsed"} ${rightOpen ? "ar-right-open" : "ar-right-collapsed"}`}>
        {leftOpen && (
          <aside className={`ar-sidebar ar-plan-sidebar ${mobilePanel === "plan" ? "ar-mobile-open" : ""}`}>
            <SidebarPlan plan={learningPlan} current={currentTaskIndex} completed={completedTaskIndexes} progress={planProgress} onClose={() => setMobilePanel(null)} />
          </aside>
        )}

        <main className="ar-main">
          <div className="ar-context-strip">
            <div><span className="ar-eyebrow">LEARNING ROOM</span><strong>{phaseLabel}</strong></div>
            <div className="ar-context-progress"><span>{learningPlan.length ? `${completedCount}/${learningPlan.length} steps` : "Continuous conversation"}</span><div><i style={{ width: `${planProgress}%` }} /></div></div>
          </div>

          {teachingLocked && <PracticeBanner />}
          {error && <div className="ar-error"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div>}

          <section className="ar-conversation" aria-live="polite">
            {messages
              .filter(m => !["welcome", "system", "timer_start", "timer_end", "summary"].includes(m.messageType))
              .map((msg, index) => (
                <MessageCard key={msg.id || index} msg={msg} onCopy={setCopiedId} copiedId={copiedId} />
              ))}

            {aiWorking && <AgentThinking phase={phase} />}
            {phase === "preparing" && <PreparingCard />}
            {phase === "studying" && <StudyCard seconds={timerSeconds} task={currentTask} />}

            {phase === "practice" && currentQuestion && (
              <QuizArtifact
                question={currentQuestion}
                index={qIndex}
                total={questions.length}
                answer={answerInput}
                setAnswer={setAnswerInput}
                onSubmit={submitAnswer}
                submitting={submitting}
                results={checkResults}
              />
            )}
            <div ref={bottomRef} />
          </section>

          <div className="ar-composer-wrap">
            {phase !== "practice" && (
              <div className="ar-command-row">
                <span className="ar-command-label">Talk to your tutor</span>
                {quickActions.map(([key, label, prompt]) => <button key={key} className="ar-command-chip" disabled={!canType} onClick={() => sendMessage(prompt)}>{label}</button>)}
              </div>
            )}
            <form className="ar-composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
              <div className="ar-composer-icon"><TutorAvatar size={30} /></div>
              <textarea
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={!canType}
                rows={1}
                placeholder={phase === "practice" ? "Practice mode is active — answer the question above…" : "Talk to UPRAD about what you're learning…"}
              />
              <button className="ar-send" type="submit" disabled={!msgInput.trim() || !canType}>↑</button>
            </form>
            <div className="ar-composer-foot"><span>Enter to send · Shift + Enter for a new line</span><span>The conversation is your Learning Room</span></div>
          </div>
        </main>

        {rightOpen && (
          <aside className={`ar-sidebar ar-work-sidebar ${mobilePanel === "tools" ? "ar-mobile-open" : ""}`}>
            <WorkspacePanel session={session} task={currentTask} phase={phase} progress={planProgress} familiarity={session?.studentFamiliarity} intent={session?.intent} answeredCount={answeredCount} questionCount={questions.length} onStudy={startStudyMode} onClose={() => setMobilePanel(null)} />
          </aside>
        )}
      </div>

      {mobilePanel && <button className="ar-mobile-backdrop" onClick={() => setMobilePanel(null)} aria-label="Close panel" />}
      {restoreNotice && <div className="ar-toast" role="status"><strong>✓ Practice complete</strong><span>Your learning conversation has been restored.</span></div>}
    </div>
  );
}

function SidebarPlan({ plan, current, completed, progress, onClose }) {
  return <div className="ar-panel-inner">
    <div className="ar-panel-head"><div><span className="ar-eyebrow">ROADMAP</span><h2>Learning plan</h2></div><button className="ar-mobile-close" onClick={onClose}>×</button></div>
    <div className="ar-plan-progress"><div className="ar-plan-ring" style={{ "--p": `${progress * 3.6}deg` }}><span>{progress}%</span></div><div><strong>{completed.length} of {plan.length || 0} complete</strong><small>The roadmap is context. UPRAD drives the conversation.</small></div></div>
    <div className="ar-task-list">{plan.length ? plan.map((task, index) => <div key={index} className={`ar-task ${completed.includes(index) ? "done" : current === index ? "active" : ""}`}><span className="ar-task-number">{completed.includes(index) ? "✓" : index + 1}</span><span className="ar-task-copy"><b>{taskTitle(task)}</b><small>{taskDescription(task)}</small><em>{completed.includes(index) ? "Completed" : current === index ? "Current focus" : taskMeta(task)}</em></span></div>) : <div className="ar-empty-plan"><span>✦</span><p>Your tutor is building the learning context.</p></div>}</div>
  </div>;
}

function WorkspacePanel({ session, task, phase, progress, familiarity, intent, answeredCount, questionCount, onStudy, onClose }) {
  return <div className="ar-panel-inner">
    <div className="ar-panel-head"><div><span className="ar-eyebrow">WORKSPACE</span><h2>Session tools</h2></div><button className="ar-mobile-close" onClick={onClose}>×</button></div>
    <div className="ar-current-card"><span className="ar-current-kicker">NOW LEARNING</span><h3>{taskTitle(task) || session?.conceptName || "Building your lesson"}</h3><p>{taskDescription(task) || "Talk with UPRAD. It will decide when you are ready for a check."}</p><div className="ar-context-facts">{familiarity && <span>Starting point: {formatFamiliarity(familiarity)}</span>}{intent && <span>Goal: {formatIntent(intent)}</span>}</div><span className={`ar-phase-pill ar-phase-${phase}`}>{phase.replace("_", " ")}</span></div>
    <div className="ar-stats-card"><div><b>{progress}%</b><span>Roadmap progress</span></div><div><b>{answeredCount}</b><span>Checks answered</span></div><div><b>{questionCount}</b><span>Current run</span></div></div>
    {(phase === "teaching" || phase === "reteaching") && <button className="ar-study-tool" onClick={onStudy}><span>◷</span><b>Optional study timer</b><small>Focus for 5 minutes before continuing the conversation.</small></button>}
    <div className="ar-tool-tip"><b>Stay in the conversation.</b><span>Ask for examples, simpler explanations, applications, or anything that helps the idea click. UPRAD decides when to check your understanding.</span></div>
  </div>;
}

function MessageCard({ msg, onCopy, copiedId }) {
  const ai = msg.role === "ai";
  const locked = ai && msg.extra?.locked;
  const action = msg.extra?.action;
  return <article className={`ar-message ${ai ? "ar-message-ai" : "ar-message-user"} ${locked ? "ar-message-locked" : ""}`}>
    {ai ? <div className="ar-message-avatar"><TutorAvatar size={34} /></div> : <div className="ar-user-avatar">You</div>}
    <div className="ar-message-column"><div className="ar-message-meta"><span>{ai ? "UPRAD" : "You"}</span>{ai && <span className="ar-meta-dot">·</span>}{ai && <span>{locked ? "Practice lock" : msg.messageType === "reteach" ? "Reteach" : "Tutor"}</span>}<time>{formatClock(msg.createdAt)}</time></div>
      <div className="ar-message-card">{locked && <div className="ar-locked-label">🔒 Teaching temporarily hidden</div>}{action && <div className="ar-agent-badge"><span>✦</span>{activityLabel(action)}</div>}<RichText content={msg.content} onCopy={onCopy} copiedId={copiedId} /></div>
    </div>
  </article>;
}

function PracticeBanner() {
  return <div className="ar-practice-banner" role="status"><span className="ar-practice-banner-icon">🔒</span><div><strong>PRACTICE MODE</strong><span>Teaching content is temporarily hidden. Show what you understand without looking back.</span></div></div>;
}

function AgentThinking() { return <div className="ar-thinking"><div className="ar-thinking-avatar"><TutorAvatar size={30} /></div><div className="ar-thinking-body"><div className="ar-thinking-title">UPRAD is working</div><div className="ar-thinking-steps"><span className="active">Understanding your response</span><span>Choosing the next teaching move</span><span>Updating your learning path</span></div><div className="ar-thinking-dots"><i /><i /><i /></div></div></div>; }
function PreparingCard() { return <div className="ar-preparing-card"><div className="ar-preparing-orb">✦</div><div><span className="ar-eyebrow">BUILDING YOUR LESSON</span><h3>UPRAD is assembling the right starting point</h3><p>It is combining the concept, your starting level, and the learning goal into a focused conversation.</p><div className="ar-loading-line"><i /><i /><i /></div></div></div>; }

function StudyCard({ seconds, task }) { return <div className="ar-study-card"><div className="ar-study-orbit"><span>{formatTime(seconds)}</span><small>Focus</small></div><div className="ar-study-copy"><span className="ar-eyebrow">OPTIONAL STUDY MODE</span><h3>{taskTitle(task) || "Study the current idea"}</h3><p>Review what UPRAD taught, then return to the conversation. The timer is server-backed and survives refresh.</p></div></div>; }

function QuizArtifact({ question, index, total, answer, setAnswer, onSubmit, submitting, results }) {
  const options = Array.isArray(question.options) ? question.options : [];
  const mc = question.questionType === "multiple_choice" && options.length;
  return <section className="ar-quiz-artifact ar-practice-card">
    <div className="ar-artifact-head"><div><span className="ar-eyebrow">PRACTICE · QUESTION {index + 1}</span><h2>Show what you understand</h2></div><span className="ar-quiz-count">{index + 1}/{total}</span></div>
    <div className="ar-quiz-progress">{Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? "done" : i === index ? "current" : ""} />)}</div>
    <div className="ar-quiz-question">{question.question}</div>
    {mc ? <div className="ar-options">{options.map((opt, i) => { const value = typeof opt === "string" ? opt : (opt.value ?? opt.label ?? opt.text); const text = typeof opt === "string" ? opt : (opt.text ?? opt.label ?? opt.value); return <button key={`${question.id}-${i}`} className={`ar-option ${answer === value ? "selected" : ""}`} onClick={() => setAnswer(value)} disabled={submitting}><span>{String.fromCharCode(65 + i)}</span><b>{text}</b></button>; })}</div> : <textarea className="ar-answer-box" rows={5} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Explain your answer in your own words…" disabled={submitting} />}
    <div className="ar-quiz-foot"><span>One question at a time. Your answer is saved to this learning session.</span><button onClick={onSubmit} disabled={!answer.trim() || submitting}>{submitting ? "Evaluating…" : index + 1 === total ? "Finish practice" : "Submit answer →"}</button></div>
    {Object.keys(results).length > 0 && <div className="ar-quiz-note">{Object.keys(results).length} response{Object.keys(results).length > 1 ? "s" : ""} recorded in this run.</div>}
  </section>;
}

function RichText({ content, onCopy, copiedId }) {
  if (!content) return null;
  const normalized = String(content).replace(/\r\n/g, "\n").trim();
  return <div className="ar-rich">{normalized.split(/\n{2,}/).map((block, i) => {
    const trimmed = block.trim(); if (!trimmed) return null;
    const fence = trimmed.match(/^```([^\n]*)\n([\s\S]*?)```$/);
    if (fence) { const id = `code-${i}-${trimmed.length}`; return <div className="ar-code-wrap" key={i}><div className="ar-code-head"><span>{fence[1] || "code"}</span><button onClick={() => copyText(fence[2], id, onCopy)}>{copiedId === id ? "Copied" : "Copy"}</button></div><pre><code>{fence[2]}</code></pre></div>; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const Tag = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4"; return <Tag key={i}>{inlineMarkdown(heading[2])}</Tag>; }
    const lines = trimmed.split("\n");
    if (lines.every(l => /^[-*]\s+/.test(l.trim()))) return <ul key={i}>{lines.map((line,j)=><li key={j}>{inlineMarkdown(line.trim().replace(/^[-*]\s+/,""))}</li>)}</ul>;
    if (lines.every(l => /^\d+\.\s+/.test(l.trim()))) return <ol key={i}>{lines.map((line,j)=><li key={j}>{inlineMarkdown(line.trim().replace(/^\d+\.\s+/,""))}</li>)}</ol>;
    return <p key={i}>{inlineMarkdown(trimmed)}</p>;
  })}</div>;
}
function inlineMarkdown(text) { const safe = String(text); return safe.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g).map((part,i)=>{ if ((part.startsWith("**")&&part.endsWith("**"))||(part.startsWith("__")&&part.endsWith("__"))) return <strong key={i}>{part.slice(2,-2)}</strong>; if ((part.startsWith("*")&&part.endsWith("*"))||(part.startsWith("_")&&part.endsWith("_"))) return <em key={i}>{part.slice(1,-1)}</em>; if(part.startsWith("`")&&part.endsWith("`")) return <code key={i}>{part.slice(1,-1)}</code>; return part; }); }
async function copyText(text,id,onCopy){try{await navigator.clipboard?.writeText(text);onCopy(id);setTimeout(()=>onCopy(null),1300);}catch{}}
function formatFamiliarity(v){return({new:"new to this",seen_before:"seen it before",know_basics:"basics understood",know_well:"confident with it",need_help:"specific help needed"})[v]||v;}
function formatIntent(v){return({teach_me:"learn the concept",explain_simply:"simple explanation",give_examples:"learn through examples",go_deeper:"go deeper",already_know:"probe existing understanding",quiz_me:"diagnostic first",broaden:"broaden the context",custom:"custom goal"})[v]||v;}
function taskTitle(task){return task?.title||task?.name||task?.concept||task?.task||"Learning step";}
function taskDescription(task){return task?.description||task?.objective||task?.goal||task?.summary||"Build understanding and apply the idea.";}
function taskMeta(task){return task?.estimatedMinutes?`${task.estimatedMinutes} min`:task?.recommended_minutes?`${task.recommended_minutes} min`:task?.type||"Guided learning";}
function activityLabel(action){return({practice_complete:"Practice complete"})[action]||"Tutor action";}
function formatClock(value){if(!value)return"";const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
function formatTime(seconds){const m=Math.floor(Number(seconds||0)/60);const s=Math.max(0,Number(seconds||0)%60);return`${m}:${String(s).padStart(2,"0")}`;}
function RoomSkeleton(){return <div className="ar-room ar-loading"><header className="ar-header"><div className="ar-skeleton ar-sk-circle"/><div className="ar-skeleton ar-sk-title"/></header><div className="ar-loading-layout"><div className="ar-skeleton ar-sk-side"/><div className="ar-sk-chat">{[70,50,82,42].map((w,i)=><div key={i} className="ar-skeleton ar-sk-bubble" style={{width:`${w}%`}}/>)}</div><div className="ar-skeleton ar-sk-side"/></div></div>;}
function ErrorRoom({message,onBack}){return <div className="ar-room ar-error-room"><div className="ar-error-card"><span>!</span><h2>Learning room unavailable</h2><p>{message}</p><button onClick={onBack}>Back to AI Learning</button></div></div>;}
