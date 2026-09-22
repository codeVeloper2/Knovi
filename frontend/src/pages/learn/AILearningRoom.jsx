/**
 * AILearningRoom — Agentic Education Workspace
 *
 * A focused learning environment inspired by modern agentic workspaces:
 * - the AI teaches conversationally
 * - the left rail is the live learning plan/task list
 * - the center is a rich, markdown-aware tutor conversation
 * - the right rail is the learner workspace (current task, actions, progress)
 * - quiz/retrieval is a first-class structured artifact
 * - mobile collapses the rails into drawers without losing functionality
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { TutorAvatar } from "./AISessionSetup";
import "../../styles/ai-room.css";

function statusToPhase(status, hasMessages) {
  switch (status) {
    case "created": return "preparing";
    case "teaching": return hasMessages ? "teaching" : "preparing";
    case "studying": return "studying";
    case "retrieval": return "retrieval";
    case "reteaching": return "reteaching";
    case "practice": return "practice";
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

  const [teaching, setTeaching] = useState(null);
  const [learningPlan, setLearningPlan] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [completedTaskIndexes, setCompletedTaskIndexes] = useState([]);

  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [checkResults, setCheckResults] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [studyPeriod, setStudyPeriod] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [activity, setActivity] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const ttsRef = useRef(false);

  const conceptName = session?.conceptName || "Learning session";
  const subjectName = session?.subjectName || "AI Learning";
  const topicName = session?.topicName || "";
  const currentTask = learningPlan[currentTaskIndex] || null;
  const completedCount = completedTaskIndexes.length;
  const planProgress = learningPlan.length
    ? Math.round((completedCount / learningPlan.length) * 100)
    : 0;

  const canType =
    ["teaching", "reteaching", "summary"].includes(phase) && !aiWorking;

  const answeredCount = Object.keys(checkResults).length;
  const currentQuestion = questions[qIndex];
  const teachingHidden = phase === "retrieval" || phase === "practice";

  const phaseLabel = {
    preparing: "Preparing lesson",
    teaching: "Teaching",
    reteaching: "Reteaching",
    studying: "Study mode",
    retrieval: "Quick check",
    practice: "Practice",
    summary: "Session complete",
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
    if (!messages.length) return;
    const nextActivity = messages
      .filter(m => m?.extra?.action || m?.extra?.suggestNewSession)
      .slice(-8)
      .map((m, i) => ({
        id: `${m.id || "local"}-${i}`,
        action: m.extra?.action,
        text: activityText(m.extra?.action),
        time: m.createdAt,
      }));
    setActivity(nextActivity);
  }, [messages]);

  async function loadSession() {
    setLoading(true);
    setError(null);
    try {
      const sess = await api.getAISession(sessionId);
      let msgs = Array.isArray(sess?.messages) ? sess.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) msgs = fetched;
      } catch {}

      applySession(sess, msgs);
      if (sess.status === "created") await prepareSession(sess);
    } catch (err) {
      setError(err.message || "Could not open this learning room.");
    } finally {
      setLoading(false);
    }
  }

  async function prepareSession(sess) {
    setAiWorking(true);
    setPhase("preparing");
    try {
      await api.prepareAISession(sessionId);
      const fresh = await api.getAISession(sessionId);
      let msgs = Array.isArray(fresh?.messages) ? fresh.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) msgs = fetched;
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

    const plan =
      sess?.teaching?.learningPlan ||
      safe.slice().reverse().map(m => m?.extra?.learningPlan).find(p => Array.isArray(p) && p.length) ||
      [];
    if (Array.isArray(plan)) setLearningPlan(plan);

    const timerMsg = safe.filter(m => m?.messageType === "timer_start" && m?.extra?.taskIndex != null).slice(-1)[0];
    if (timerMsg?.extra?.taskIndex != null) setCurrentTaskIndex(Number(timerMsg.extra.taskIndex));

    setPhase(statusToPhase(sess?.status, safe.some(m => m.messageType === "teaching" || m.messageType === "reteach")));
    if (sess?.teaching) setTeaching(sess.teaching);
    if (sess?.summary) setSummary(sess.summary);

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

    if (["retrieval", "practice", "summary"].includes(statusToPhase(sess?.status, true)) && sess?.questions?.length) {
      const qs = sess.questions;
      setQuestions(qs);
      const answered = new Set((sess.answers || []).map(a => Number(a.questionId)));
      const next = qs.findIndex(q => !answered.has(Number(q.id)));
      setQIndex(next === -1 ? Math.max(0, qs.length - 1) : next);
    }

    if (sess?.activeStudyPeriod && sess.status === "studying") {
      const remaining = Number(sess.activeStudyPeriod.remainingSeconds || 0);
      setStudyPeriod(sess.activeStudyPeriod);
      if (remaining > 0) startTimer(remaining, sess.activeStudyPeriod.id);
    }
  }

  function speak(text) {
    if (!ttsRef.current || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, " code ").replace(/[#*_`~>-]+/g, " ").replace(/\s+/g, " ").trim();
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

  async function startTask(task, index) {
    if (!task || aiWorking) return;
    setAiWorking(true);
    setError(null);
    setCurrentTaskIndex(index);
    setAnswerInput("");
    setQuestions([]);
    try {
      const t = await api.teachConcept(sessionId, index);
      setTeaching(t);
      if (Array.isArray(t?.learningPlan) && t.learningPlan.length) setLearningPlan(t.learningPlan);
      if (t?.explanation) {
        addLocalMessage("ai", t.explanation, { strategy: t.strategy, taskIndex: index }, "teaching");
        speak(t.explanation);
      }
      const fresh = await api.getAISession(sessionId);
      setSession(fresh);
      setPhase("teaching");
    } catch (err) {
      setError(err.message || "Could not start this learning task.");
    } finally {
      setAiWorking(false);
    }
  }

  async function sendMessage(raw) {
    const content = (raw || msgInput).trim();
    if (!content || aiWorking || !canType) return;
    setMsgInput("");
    setError(null);
    addLocalMessage("student", content, {}, "question");

    if (isQuizRequest(content)) {
      await generateQuiz();
      return;
    }

    setAiWorking(true);
    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      setMessages(prev => [...prev, msg]);
      speak(msg.content || "");

      const action = msg.extra?.action;
      if (action === "start_quiz") {
        await generateQuiz(msg.extra?.actionData?.task_index ?? currentTaskIndex);
      }
    } catch (err) {
      setError(err.message || "The tutor could not respond.");
    } finally {
      setAiWorking(false);
    }
  }

  async function generateQuiz(taskIndex = currentTaskIndex) {
    setAiWorking(true);
    setError(null);
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3, taskIndex);
      const arr = Array.isArray(qs) ? qs : (qs?.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setPhase("retrieval");
      setSession(prev => ({ ...prev, status: "retrieval" }));
      addLocalMessage("ai", "I’ve generated a focused quick check for this task. Answer one question at a time; I’ll adapt what happens next.", {
        action: "start_quiz",
        actionData: { task_index: taskIndex },
      }, "agent");
    } catch (err) {
      setError(err.message || "Could not generate the quick check.");
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
      addLocalMessage("student", formatAnswerForChat(currentQuestion, answer), { questionId: currentQuestion.id }, "answer");
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

      if (evaluation.needsReteach) {
        await reteach(evaluation.misconception);
        // The new teaching snapshot is persisted before this call, so the next
        // retrieval is generated from the reteach rather than the old explanation.
        await generateQuiz(currentTaskIndex);
        return;
      }

      const next = qIndex + 1;
      if (next < questions.length) {
        setAnswerInput("");
        setQIndex(next);
      } else {
        setCompletedTaskIndexes(prev => [...new Set([...prev, currentTaskIndex])]);
        const nextTask = currentTaskIndex + 1;
        if (learningPlan[nextTask]) {
          addLocalMessage("ai", `Nice work. Task ${currentTaskIndex + 1} is complete. I’m moving us to **${taskTitle(learningPlan[nextTask])}** next.`, {
            action: "next_task",
            actionData: { task_index: nextTask },
          }, "agent");
          await startTask(learningPlan[nextTask], nextTask);
        } else {
          await completeSession();
        }
      }
    } catch (err) {
      setError(err.message || "Could not evaluate that answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reteach(reason) {
    setAiWorking(true);
    try {
      const t = await api.generateAdaptiveReteach(sessionId, reason || "Student needs a different explanation.");
      setTeaching(t);
      setPhase("reteaching");
      if (t?.explanation) {
        addLocalMessage("ai", t.explanation, { strategy: t.strategy, action: "reteach" }, "reteach");
        speak(t.explanation);
      }
    } catch (err) {
      setError(err.message || "Could not generate a fresh explanation.");
    } finally {
      setAiWorking(false);
    }
  }

  async function completeSession() {
    setAiWorking(true);
    try {
      const s = await api.generateSessionSummary(sessionId);
      const fresh = await api.getAISession(sessionId);
      let msgs = Array.isArray(fresh?.messages) ? fresh.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) msgs = fetched;
      } catch {}
      setSummary(s || fresh?.summary || null);
      setSession(fresh);
      setMessages(msgs);
      setPhase("summary");
      addLocalMessage("ai", "Session complete. I’ve turned your work into a compact review you can come back to.", { action: "complete_session" }, "agent");
    } catch (err) {
      setError(err.message || "Could not generate your session summary.");
    } finally {
      setAiWorking(false);
    }
  }

  async function startStudyMode() {
    setAiWorking(true);
    try {
      const period = await api.startStudyPeriod(sessionId, 300, currentTaskIndex);
      setStudyPeriod(period);
      setTimerSeconds(period.durationSeconds);
      setPhase("studying");
      setSession(prev => ({ ...prev, status: "studying" }));
      startTimer(period.durationSeconds, period.id);
    } catch (err) {
      setError(err.message || "Could not start study mode.");
    } finally {
      setAiWorking(false);
    }
  }

  function startTimer(seconds, periodId) {
    clearInterval(timerRef.current);
    setTimerSeconds(seconds);
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          finishStudy(periodId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function finishStudy(periodId) {
    clearInterval(timerRef.current);
    try {
      await api.finishStudyPeriod(sessionId, periodId);
      await generateQuiz(currentTaskIndex);
    } catch (err) {
      setError(err.message || "Study mode could not transition to the quick check.");
    }
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

  async function practiceAgain() {
    if (!session) return;
    setAiWorking(true);
    try {
      const next = await api.createAISession({
        subjectId: session.subjectId,
        topicId: session.topicId,
        conceptId: session.conceptId,
        familiarity: session.studentFamiliarity || "new",
        intent: "teach_me",
        studentNote: session.studentNote || null,
      });
      await api.prepareAISession(next.id);
      navigate(`/app/learn/ai/session/${next.id}`);
    } catch (err) {
      setError(err.message || "Could not start another session.");
      setAiWorking(false);
    }
  }

  function isQuizRequest(text) {
    return /\b(quiz me|test me|give me (a )?quiz|quick check|test my knowledge)\b/i.test(text || "");
  }

  const quickActions = [
    ["example", "Show an example", "Give me a concrete example of this."],
    ["simpler", "Make it simpler", "Explain this in a simpler way without losing the important idea."],
    ["why", "Why does this work?", "Why does this work this way?"],
    ["apply", "Apply it", "Give me a real-world application of this idea."],
    ["quiz", "Quiz me", "Quiz me on what we just covered."],
    ["recap", "Recap", "Give me a concise recap of the key ideas so far."],
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
        <div className="ar-header-center">
          <span className="ar-live-dot" />
          <span>{aiWorking ? "UPRAD is working…" : phaseLabel}</span>
        </div>
        <div className="ar-header-right">
          <button className={`ar-icon-btn ar-voice ${ttsEnabled ? "active" : ""}`} onClick={toggleTts} title="Tutor voice" aria-label="Toggle tutor voice">{ttsEnabled ? "◖)" : "◖"}</button>
          <button className="ar-header-action" onClick={() => setMobilePanel("plan")}>Plan</button>
          <button className="ar-header-action" onClick={() => setMobilePanel("tools")}>Tools</button>
          <button className="ar-end" onClick={endSession}>End</button>
        </div>
      </header>

      <div className="ar-layout">
        <aside className={`ar-sidebar ar-plan-sidebar ${mobilePanel === "plan" ? "ar-mobile-open" : ""}`}>
          <SidebarPlan
            plan={learningPlan}
            current={currentTaskIndex}
            completed={completedTaskIndexes}
            progress={planProgress}
            onClose={() => setMobilePanel(null)}
          />
        </aside>

        <main className="ar-main">
          <div className="ar-context-strip">
            <div>
              <span className="ar-eyebrow">LEARNING ROOM</span>
              <strong>{phaseLabel}</strong>
            </div>
            <div className="ar-context-progress">
              <span>{completedCount}/{learningPlan.length || 0} tasks</span>
              <div><i style={{ width: `${planProgress}%` }} /></div>
            </div>
          </div>

          {error && <div className="ar-error"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div>}

          <section className="ar-conversation" aria-live="polite">
            {messages
              .filter(m => !["welcome", "system", "timer_start", "timer_end", "summary"].includes(m.messageType))
              .filter(m => !teachingHidden || !["teaching", "reteach"].includes(m.messageType))
              .map((msg, index) => (
                <MessageCard
                  key={msg.id || index}
                  msg={msg}
                  onCopy={setCopiedId}
                  copiedId={copiedId}
                />
              ))}

            {aiWorking && <AgentThinking phase={phase} />}

            {phase === "preparing" && <PreparingCard />}
            {phase === "teaching" && !aiWorking && learningPlan.length > 0 && (
              <AgentCheckpoint
                task={currentTask}
                taskIndex={currentTaskIndex}
                onQuiz={() => generateQuiz(currentTaskIndex)}
                onStudy={startStudyMode}
                disabled={aiWorking}
              />
            )}

            {phase === "studying" && (
              <StudyCard
                seconds={timerSeconds}
                total={studyPeriod?.durationSeconds || 300}
                task={currentTask}
              />
            )}

            {["retrieval", "practice"].includes(phase) && currentQuestion && (
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

            {phase === "summary" && summary && (
              <SummaryArtifact
                summary={summary}
                conceptName={conceptName}
                onPractice={practiceAgain}
                onBack={() => navigate("/app/learn/ai")}
                onOpen={() => setShowSummary(true)}
              />
            )}

            <div ref={bottomRef} />
          </section>

          <div className="ar-composer-wrap">
            <div className="ar-command-row">
              <span className="ar-command-label">Ask the tutor</span>
              {quickActions.slice(0, 4).map(([key, label, prompt]) => (
                <button key={key} className="ar-command-chip" disabled={!canType} onClick={() => sendMessage(prompt)}>{label}</button>
              ))}
              <button className="ar-command-chip ar-command-chip--accent" disabled={!canType} onClick={() => generateQuiz(currentTaskIndex)}>Generate quiz</button>
            </div>
            <form className="ar-composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
              <div className="ar-composer-icon"><TutorAvatar size={30} /></div>
              <textarea
                ref={inputRef}
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={!canType}
                rows={1}
                placeholder={
                  phase === "retrieval" || phase === "practice" ? "Answer the quick check above…" :
                  phase === "studying" ? "Study mode is active — focus on the current task…" :
                  "Ask UPRAD anything about this topic…"
                }
              />
              <button className="ar-send" type="submit" disabled={!msgInput.trim() || !canType}>↑</button>
            </form>
            <div className="ar-composer-foot">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>UPRAD adapts the lesson as you learn</span>
            </div>
          </div>
        </main>

        <aside className={`ar-sidebar ar-work-sidebar ${mobilePanel === "tools" ? "ar-mobile-open" : ""}`}>
          <WorkspacePanel
            session={session}
            task={currentTask}
            phase={phase}
            progress={planProgress}
            familiarity={session?.studentFamiliarity}
            intent={session?.intent}
            activity={activity}
            answeredCount={answeredCount}
            questionCount={questions.length}
            onQuiz={() => generateQuiz(currentTaskIndex)}
            onStudy={startStudyMode}
            onClose={() => setMobilePanel(null)}
          />
        </aside>
      </div>

      {mobilePanel && <button className="ar-mobile-backdrop" onClick={() => setMobilePanel(null)} aria-label="Close panel" />}
      {showSummary && summary && (
        <SummaryModal summary={summary} conceptName={conceptName} onClose={() => setShowSummary(false)} onPractice={practiceAgain} onBack={() => navigate("/app/learn/ai")} />
      )}
    </div>
  );
}

function SidebarPlan({ plan, current, completed, progress, onClose }) {
  return (
    <div className="ar-panel-inner">
      <div className="ar-panel-head">
        <div><span className="ar-eyebrow">YOUR MISSION</span><h2>Learning plan</h2></div>
        <button className="ar-mobile-close" onClick={onClose}>×</button>
      </div>
      <div className="ar-plan-progress">
        <div className="ar-plan-ring" style={{"--p": `${progress * 3.6}deg`}}><span>{progress}%</span></div>
        <div><strong>{completed.length} of {plan.length || 0} complete</strong><small>UPRAD will guide you through each step.</small></div>
      </div>
      <div className="ar-task-list">
        {plan.length ? plan.map((task, index) => {
          const done = completed.includes(index);
          const active = current === index && !done;
          return (
            <div
              key={index}
              className={`ar-task ${done ? "done" : ""} ${active ? "active" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="ar-task-number">{done ? "✓" : index + 1}</span>
              <span className="ar-task-copy">
                <b>{taskTitle(task)}</b>
                <small>{taskDescription(task)}</small>
                <em>{done ? "Completed" : active ? "Current focus" : taskMeta(task)}</em>
              </span>
            </div>
          );
        }) : (
          <div className="ar-empty-plan"><span>✦</span><p>Your tutor is building a plan around this concept.</p></div>
        )}
      </div>
      <div className="ar-plan-note">
        <span>✦</span>
        <p><b>Continuous tutor</b> uses this roadmap as context. You stay in one learning room while UPRAD chooses the next teaching move.</p>
      </div>
    </div>
  );
}

function WorkspacePanel({ session, task, phase, progress, familiarity, intent, activity, answeredCount, questionCount, onQuiz, onStudy, onClose }) {
  return (
    <div className="ar-panel-inner">
      <div className="ar-panel-head">
        <div><span className="ar-eyebrow">WORKSPACE</span><h2>Session tools</h2></div>
        <button className="ar-mobile-close" onClick={onClose}>×</button>
      </div>

      <div className="ar-current-card">
        <span className="ar-current-kicker">NOW LEARNING</span>
        <h3>{taskTitle(task) || session?.conceptName || "Building your lesson"}</h3>
        <p>{taskDescription(task) || "The tutor will keep the lesson focused and adaptive."}</p>
        <div className="ar-context-facts">
          {familiarity && <span>Starting point: {formatFamiliarity(familiarity)}</span>}
          {intent && <span>Goal: {formatIntent(intent)}</span>}
        </div>
        <span className={`ar-phase-pill ar-phase-${phase}`}>{phase.replace("_", " ")}</span>
      </div>

      <div className="ar-tool-grid">
        <button onClick={onQuiz} disabled={["retrieval", "practice", "summary"].includes(phase)}>
          <span>✦</span><b>Generate quiz</b><small>Test what stuck</small>
        </button>
        <button onClick={onStudy} disabled={phase !== "teaching" && phase !== "reteaching"}>
          <span>◷</span><b>Study mode</b><small>Focused 5 min</small>
        </button>
      </div>

      <div className="ar-stats-card">
        <div><b>{progress}%</b><span>Plan progress</span></div>
        <div><b>{answeredCount}</b><span>Checks answered</span></div>
        <div><b>{questionCount}</b><span>Questions in run</span></div>
      </div>

      <div className="ar-activity">
        <div className="ar-subhead"><span>AGENT ACTIVITY</span><small>Live</small></div>
        {activity.length ? activity.slice().reverse().map(item => (
          <div className="ar-activity-item" key={item.id}>
            <span>✓</span>
            <div><b>{activityLabel(item.action)}</b><small>{formatClock(item.time)}</small></div>
          </div>
        )) : (
          <div className="ar-activity-empty">The tutor's actions will appear here as the lesson evolves.</div>
        )}
      </div>

      <div className="ar-tool-tip">
        <b>Think out loud.</b>
        <span>Ask for examples, analogies, counterexamples, practice, or a simpler explanation. UPRAD uses your responses to adapt.</span>
      </div>
    </div>
  );
}

function MessageCard({ msg, onCopy, copiedId }) {
  const ai = msg.role === "ai";
  const action = msg.extra?.action;
  const id = msg.id;
  return (
    <article className={`ar-message ${ai ? "ar-message-ai" : "ar-message-user"}`}>
      {ai ? <div className="ar-message-avatar"><TutorAvatar size={34} /></div> : <div className="ar-user-avatar">You</div>}
      <div className="ar-message-column">
        <div className="ar-message-meta">
          <span>{ai ? "UPRAD" : "You"}</span>
          {ai && <span className="ar-meta-dot">·</span>}
          {ai && <span>{msg.messageType === "reteach" ? "Reteach" : msg.messageType === "agent" ? "Agent action" : "Tutor"}</span>}
          <time>{formatClock(msg.createdAt)}</time>
        </div>
        <div className="ar-message-card">
          {action && <div className="ar-agent-badge"><span>✦</span>{activityLabel(action)}</div>}
          <RichText content={msg.content} onCopy={onCopy} copiedId={copiedId} />
        </div>
      </div>
    </article>
  );
}

function AgentThinking({ phase }) {
  return (
    <div className="ar-thinking">
      <div className="ar-thinking-avatar"><TutorAvatar size={30} /></div>
      <div className="ar-thinking-body">
        <div className="ar-thinking-title">UPRAD is working</div>
        <div className="ar-thinking-steps">
          <span className="active">Understanding your response</span>
          <span>Choosing the next teaching move</span>
          <span>{phase === "retrieval" ? "Preparing your quick check" : "Updating your learning path"}</span>
        </div>
        <div className="ar-thinking-dots"><i /><i /><i /></div>
      </div>
    </div>
  );
}

function AgentCheckpoint({ task, taskIndex, onQuiz, onStudy, disabled }) {
  return (
    <div className="ar-agent-checkpoint">
      <div className="ar-agent-checkpoint-icon">✦</div>
      <div className="ar-agent-checkpoint-copy">
        <span className="ar-eyebrow">AGENT CHECKPOINT · STEP {taskIndex + 1}</span>
        <h3>{taskTitle(task) || "Keep exploring the concept"}</h3>
        <p>Ask questions until the idea feels clear. When UPRAD sees enough evidence of understanding, it can generate a quick check automatically.</p>
        <div className="ar-checkpoint-actions">
          <button onClick={onQuiz} disabled={disabled}>Generate quiz now</button>
          <button onClick={onStudy} disabled={disabled}>Open study mode</button>
        </div>
      </div>
    </div>
  );
}

function StudyCard({ seconds, total, task }) {
  const pct = total ? Math.max(0, Math.min(100, Math.round((seconds / total) * 100))) : 0;
  return (
    <div className="ar-study-card">
      <div className="ar-study-orbit"><span>{formatTime(seconds)}</span><small>{seconds > 0 ? "Focus" : "Finishing…"}</small></div>
      <div className="ar-study-copy">
        <span className="ar-eyebrow">FOCUSED STUDY MODE</span>
        <h3>{taskTitle(task) || "Study the current concept"}</h3>
        <p>Review the explanation, work through the examples, and make your own notes. The recall check unlocks when the study period ends.</p>
        <div className="ar-study-track"><i style={{ width: `${pct}%` }} /></div>
        <span className="ar-study-server-note">Server-timed focus period · the session state survives refresh.</span>
      </div>
    </div>
  );
}

function QuizArtifact({ question, index, total, answer, setAnswer, onSubmit, submitting, results }) {
  const options = Array.isArray(question.options) ? question.options : [];
  const mc = question.questionType === "multiple_choice" && options.length;
  return (
    <section className="ar-quiz-artifact">
      <div className="ar-artifact-head">
        <div><span className="ar-eyebrow">UPRAD GENERATED · QUICK CHECK</span><h2>Show me what you know</h2></div>
        <span className="ar-quiz-count">{index + 1}/{total}</span>
      </div>
      <div className="ar-quiz-progress">{Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? "done" : i === index ? "current" : ""} />)}</div>
      <div className="ar-quiz-question">{question.question}</div>
      {mc ? (
        <div className="ar-options">
          {options.map((opt, i) => {
            const value = typeof opt === "string" ? opt : (opt.value ?? opt.label ?? opt.text);
            const text = typeof opt === "string" ? opt : (opt.text ?? opt.label ?? opt.value);
            const selected = answer === value;
            return (
              <button key={`${question.id}-${i}`} className={`ar-option ${selected ? "selected" : ""}`} onClick={() => setAnswer(value)} disabled={submitting}>
                <span>{String.fromCharCode(65 + i)}</span><b>{text}</b>{selected && <em>Selected</em>}
              </button>
            );
          })}
        </div>
      ) : (
        <textarea className="ar-answer-box" rows={5} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Explain your answer in your own words…" disabled={submitting} />
      )}
      <div className="ar-quiz-foot">
        <span>Answer from understanding, not memory of the wording.</span>
        <button onClick={onSubmit} disabled={!answer.trim() || submitting}>{submitting ? "Evaluating…" : index + 1 === total ? "Finish check" : "Check answer →"}</button>
      </div>
      {Object.keys(results).length > 0 && <div className="ar-quiz-note">{Object.keys(results).length} response{Object.keys(results).length > 1 ? "s" : ""} recorded in this run.</div>}
    </section>
  );
}

function SummaryArtifact({ summary, conceptName, onPractice, onBack, onOpen }) {
  return (
    <section className="ar-summary-artifact">
      <div className="ar-summary-icon">✓</div>
      <span className="ar-eyebrow">MISSION COMPLETE</span>
      <h2>{conceptName}</h2>
      {summary.overallScore != null && <div className="ar-score"><b>{summary.overallScore}</b><span>/100</span></div>}
      <p>{summary.summaryText || "Your session has been completed. Review your strengths and next steps below."}</p>
      <div className="ar-summary-grid">
        <SummaryList title="Understood well" items={summary.strengths} empty="Your tutor is still building your strengths profile." />
        <SummaryList title="Keep practicing" items={summary.areasForPractice} empty="No major practice gaps were recorded." />
      </div>
      {summary.recommendedNext && <div className="ar-next-step"><b>Next move</b><span>{summary.recommendedNext}</span></div>}
      <div className="ar-summary-actions">
        <button onClick={onOpen}>Open full summary</button>
        <button onClick={onPractice}>Practice again</button>
        <button className="ghost" onClick={onBack}>Back to AI Learning</button>
      </div>
    </section>
  );
}

function SummaryList({ title, items = [], empty }) {
  return <div className="ar-summary-list"><h3>{title}</h3>{items?.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function SummaryModal({ summary, conceptName, onClose, onPractice, onBack }) {
  return (
    <div className="ar-modal-layer">
      <button className="ar-modal-backdrop" onClick={onClose} aria-label="Close summary" />
      <section className="ar-modal">
        <div className="ar-modal-head"><div><span className="ar-eyebrow">SESSION REVIEW</span><h2>{conceptName}</h2></div><button onClick={onClose}>×</button></div>
        {summary.overallScore != null && <div className="ar-modal-score"><b>{summary.overallScore}</b><span>/100</span><small>{summary.questionsCorrect || 0} of {summary.questionsAnswered || 0} correct</small></div>}
        <SummaryList title="What you learned" items={summary.keyIdeas || []} empty={summary.summaryText || "No key ideas were returned."} />
        <SummaryList title="Strengths" items={summary.strengths} empty="Keep practicing to build a stronger mastery signal." />
        <SummaryList title="Practice next" items={summary.areasForPractice} empty="No major practice gaps recorded." />
        {summary.recommendedNext && <div className="ar-next-step"><b>Recommended next step</b><span>{summary.recommendedNext}</span></div>}
        <div className="ar-summary-actions"><button onClick={onPractice}>Start another session</button><button className="ghost" onClick={onBack}>Back to AI Learning</button></div>
      </section>
    </div>
  );
}

function PreparingCard() {
  return <div className="ar-preparing-card"><div className="ar-preparing-orb">✦</div><div><span className="ar-eyebrow">BUILDING YOUR LESSON</span><h3>UPRAD is assembling the right starting point</h3><p>It is combining the concept, your starting level, and the learning goal into a focused path.</p><div className="ar-loading-line"><i /><i /><i /></div></div></div>;
}

function RichText({ content, onCopy, copiedId }) {
  if (!content) return null;
  const normalized = String(content).replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  return (
    <div className="ar-rich">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        const fence = trimmed.match(/^```([^\n]*)\n([\s\S]*?)```$/);
        if (fence) {
          const id = `code-${i}-${trimmed.length}`;
          return (
            <div className="ar-code-wrap" key={i}>
              <div className="ar-code-head"><span>{fence[1] || "code"}</span><button onClick={() => copyText(fence[2], id, onCopy)}> {copiedId === id ? "Copied" : "Copy"} </button></div>
              <pre><code>{fence[2]}</code></pre>
            </div>
          );
        }

        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const Tag = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
          return <Tag key={i}>{inlineMarkdown(heading[2])}</Tag>;
        }

        const lines = trimmed.split("\n");
        if (lines.every(l => /^[-*]\s+/.test(l.trim()))) {
          return <ul key={i}>{lines.map((line, j) => <li key={j}>{inlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>)}</ul>;
        }
        if (lines.every(l => /^\d+\.\s+/.test(l.trim()))) {
          return <ol key={i}>{lines.map((line, j) => <li key={j}>{inlineMarkdown(line.trim().replace(/^\d+\.\s+/, ""))}</li>)}</ol>;
        }
        if (lines.every(l => /^>\s?/.test(l.trim()))) {
          return <blockquote key={i}>{lines.map((line, j) => <p key={j}>{inlineMarkdown(line.replace(/^>\s?/, ""))}</p>)}</blockquote>;
        }

        if (lines.length >= 2 && lines.every(l => l.includes("|"))) {
          const rows = lines.filter(Boolean).map(l => l.split("|").map(c => c.trim()).filter(Boolean));
          if (rows.length >= 2) return <div className="ar-table-wrap" key={i}><table><thead><tr>{rows[0].map((c,j)=><th key={j}>{inlineMarkdown(c)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,j)=><tr key={j}>{rows[0].map((_,k)=><td key={k}>{inlineMarkdown(row[k] || "")}</td>)}</tr>)}</tbody></table></div>;
        }

        return <p key={i}>{inlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

function inlineMarkdown(text) {
  const safe = String(text);
  const parts = safe.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={i}>{part.slice(2,-2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={i}>{part.slice(1,-1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1,-1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = /^(https?:\/\/|mailto:)/i.test(link[2]) ? link[2] : "#";
      return <a key={i} href={href} target={href === "#" ? undefined : "_blank"} rel="noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

async function copyText(text, id, onCopy) {
  try { await navigator.clipboard?.writeText(text); onCopy(id); setTimeout(() => onCopy(null), 1300); } catch {}
}

function formatFamiliarity(value) {
  return ({
    new: "new to this",
    seen_before: "seen it before",
    know_basics: "basics understood",
    know_well: "confident with it",
    need_help: "specific help needed",
  })[value] || value;
}
function formatIntent(value) {
  return ({
    teach_me: "learn the concept",
    explain_simply: "simple explanation",
    give_examples: "learn through examples",
    go_deeper: "go deeper",
    already_know: "probe existing understanding",
    quiz_me: "diagnostic first",
    broaden: "broaden the context",
    custom: "custom goal",
  })[value] || value;
}

function taskTitle(task) {
  if (!task) return "";
  return task.title || task.name || task.concept || task.task || `Learning step`;
}
function taskDescription(task) {
  if (!task) return "";
  return task.description || task.objective || task.goal || task.summary || "Build understanding and apply the idea.";
}
function taskMeta(task) {
  if (!task) return "";
  return task.estimatedMinutes ? `${task.estimatedMinutes} min` : task.type || "Guided learning";
}
function activityText(action) {
  return ({
    start_quiz: "Generated a quick check",
    mark_task_done: "Marked the task complete",
    next_task: "Moved to the next task",
    complete_session: "Completed the learning mission",
    reteach: "Started an adaptive reteach",
  })[action] || "Took an agent action";
}
function activityLabel(action) {
  return activityText(action);
}
function formatClock(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatTime(seconds) {
  const m = Math.floor(Number(seconds || 0) / 60);
  const s = Math.max(0, Number(seconds || 0) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function formatAnswerForChat(question, answer) {
  return `**Answer submitted**\n\n${answer}`;
}

function RoomSkeleton() {
  return <div className="ar-room ar-loading"><header className="ar-header"><div className="ar-skeleton ar-sk-circle" /><div className="ar-skeleton ar-sk-title" /></header><div className="ar-loading-layout"><div className="ar-skeleton ar-sk-side" /><div className="ar-sk-chat">{[70, 50, 82, 42].map((w,i)=><div key={i} className="ar-skeleton ar-sk-bubble" style={{width:`${w}%`}} />)}</div><div className="ar-skeleton ar-sk-side" /></div></div>;
}
function ErrorRoom({ message, onBack }) {
  return <div className="ar-room ar-error-room"><div className="ar-error-card"><span>!</span><h2>Learning room unavailable</h2><p>{message}</p><button onClick={onBack}>Back to AI Learning</button></div></div>;
}
