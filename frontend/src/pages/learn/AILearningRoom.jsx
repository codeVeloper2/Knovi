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
import "../../styles/ai-learn.css";

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
  const [checkResults, setCheckResults] = useState({});
  const [learningPlan, setLearningPlan] = useState([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [completedTaskIndexes, setCompletedTaskIndexes] = useState([]);

  const [summary,      setSummary]      = useState(null);
  const [showSummary,  setShowSummary]  = useState(false);
  const [msgInput,     setMsgInput]     = useState("");

  // Optional post-session suggestion state. These must always be defined because
  // the room can be opened directly for a new, resumed, or completed session.
  const [postSuggestion, setPostSuggestion] = useState(null);
  const [suggestionShown, setSuggestionShown] = useState(false);

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
      // The session endpoint is the source of truth. Messages are a secondary
      // request; if that endpoint fails, the session response already contains
      // a safe message snapshot, so the room must still render.
      const sess = await api.getAISession(sessionId);
      let msgs = Array.isArray(sess?.messages) ? sess.messages : [];

      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) msgs = fetched;
      } catch (messageErr) {
        // Keep the room usable. The backend session payload already contains
        // state-appropriate messages, including the restored completed history.
        console.warn("Could not load separate session messages; using session snapshot.", messageErr);
      }

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
      const freshSession = await api.getAISession(sessionId);
      let freshMessages = Array.isArray(freshSession?.messages) ? freshSession.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) freshMessages = fetched;
      } catch (messageErr) {
        console.warn("Could not refresh separate session messages; using session snapshot.", messageErr);
      }
      applyServerState(freshSession, freshMessages);
    } catch (err) {
      setError(err.message || "The AI tutor could not prepare this session.");
    } finally {
      setAiWorking(false);
    }
  }

  function applyServerState(sess, msgs) {
    setSession(sess);
    const safeMessages = Array.isArray(msgs) ? msgs : (Array.isArray(sess?.messages) ? sess.messages : []);
    setMessages(safeMessages);
    const planFromTeaching = sess?.teaching?.learningPlan || safeMessages
      .slice().reverse()
      .map(m => m?.extra?.learningPlan)
      .find(p => Array.isArray(p) && p.length) || [];
    if (Array.isArray(planFromTeaching) && planFromTeaching.length) {
      setLearningPlan(planFromTeaching);
    }

    const latestTaskTimer = safeMessages
      .filter(m => m?.messageType === "timer_start" && m?.extra?.taskIndex != null)
      .slice(-1)[0];
    if (latestTaskTimer?.extra?.taskIndex != null) {
      setCurrentTaskIndex(Number(latestTaskTimer.extra.taskIndex));
    }
    const derivedPhase = serverStatusToPhase(
      sess.status,
      safeMessages.filter(m => m.messageType === "teaching" || m.messageType === "reteach").length > 0,
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
    if (sess.answers) {
      const restored = {};
      for (const item of sess.answers) {
        if (item?.questionId == null) continue;
        restored[Number(item.questionId)] = item;
      }
      setCheckResults(restored);
      const completed = (sess.answers || [])
        .filter(item => !item?.needsReteach && item?.taskIndex != null)
        .map(item => Number(item.taskIndex));
      if (completed.length) {
        setCompletedTaskIndexes(Array.from(new Set(completed)));
      }
    }
    if ((derivedPhase === "retrieval" || derivedPhase === "practice" || derivedPhase === "summary") && sess.questions?.length > 0) {
      const nextQuestions = sess.questions;
      setQuestions(nextQuestions);
      const answered = new Set((sess.answers || []).map(item => Number(item.questionId)));
      const nextIndex = nextQuestions.findIndex(q => !answered.has(Number(q.id)));
      setQIndex(nextIndex === -1 ? Math.max(0, nextQuestions.length - 1) : nextIndex);

      // Submitted quiz questions are rendered as ordinary chat history after
      // answering. The active unanswered question is the only Quick Check card.
      // Rebuild the answered chat turns on resume because these UI messages are
      // intentionally not persisted as session messages by the backend.
      const answeredChat = buildQuizChatMessages(nextQuestions, sess.answers || []);
      if (answeredChat.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const additions = answeredChat.filter(m => !existingIds.has(m.id));
          return additions.length ? [...prev, ...additions] : prev;
        });
      }
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
    const taskIndex = currentTaskIndex;
    try {
      await api.finishStudyPeriod(sessionId, periodId);
      const sess = await api.getAISession(sessionId);
      let msgs = Array.isArray(sess?.messages) ? sess.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) msgs = fetched;
      } catch (messageErr) {
        console.warn("Could not refresh messages after study period; using session snapshot.", messageErr);
      }
      applyServerState(sess, msgs);

      // Timer completion automatically opens the retrieval card for THIS task.
      const qs = await api.generateRetrievalQuestions(sessionId, 3, taskIndex);
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      setSession(prev => ({ ...prev, status: "retrieval" }));
      setPhase("retrieval");
    } catch (err) {
      setError(err.message || "Could not transition to the recall check. Please try again.");
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

  async function handleStartTask(task, taskIndex) {
    if (!task || aiWorking) return;
    setAiWorking(true);
    setError(null);
    try {
      setCurrentTaskIndex(taskIndex);
      setAnswerInput("");
      setQuestions([]);
      setLastEval(null);

      // AI teaches the task content conversationally.
      // The AI will signal "start_quiz" when it judges the student ready —
      // no study timer is started here. The student interacts via chat.
      const t = await api.teachConcept(sessionId, taskIndex);
      if (t?.explanation) {
        setMessages(prev => [...prev, {
          id: `local-task-${Date.now()}`, role: "ai", messageType: "teaching",
          content: t.explanation, sequence: prev.length + 1,
          createdAt: new Date().toISOString(), extra: { strategy: t.strategy },
        }]);
      }
      setTeaching(t);

      const fresh = await api.getAISession(sessionId);
      setSession(fresh);
      setPhase("teaching");

      try {
        const freshMessages = await api.getSessionMessages(sessionId);
        if (Array.isArray(freshMessages)) setMessages(freshMessages);
      } catch (_) {}
    } catch (err) {
      setError(err.message || "Could not start this learning task.");
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
    // Clear any old suggestion when student asks a new question
    setPostSuggestion(null);
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}`, role: "student", messageType: "question",
      content, sequence: prev.length + 1, createdAt: new Date().toISOString(),
    }]);

    // A direct quiz request opens the structured Quick Check UI. It must not
    // be answered as a normal AI chat message.
    if (isQuizRequest(content)) {
      try {
        await triggerRetrieval();
      } catch (err) {
        setError(err.message || "Failed to generate questions.");
        setAiWorking(false);
      }
      return;
    }

    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      setMessages(prev => [...prev, msg]);
      // Check if AI flagged a suggestion for a new session (only show once per question)
      const extra = msg.extra || {};
      if (extra.suggestNewSession && !suggestionShown) {
        setPostSuggestion({
          subject: extra.detectedSubject || null,
          topic:   extra.detectedTopic   || null,
          note:    extra.sessionNote     || null,
        });
        setSuggestionShown(true);
      }

      // ── Agentic action handling ───────────────────────────────────────────
      // The AI decides when the student is ready for the quiz. No button needed.
      const action     = extra.action     || null;
      const actionData = extra.actionData || {};
      if (action === "start_quiz") {
        // AI judged the student ready — trigger quiz silently
        const taskIdx = actionData.task_index != null ? Number(actionData.task_index) : currentTaskIndex;
        await _agenticStartQuiz(taskIdx);
        return; // _agenticStartQuiz sets aiWorking false
      }
      // mark_task_done / next_task / complete_session arrive after quiz result,
      // so they are handled in handleSubmitAnswer. No further action here.
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setAiWorking(false);
    }
  }

  /**
   * Called when the AI signals action:"start_quiz" in a message response.
   * Bypasses the study-timer flow entirely — AI conversational understanding
   * is sufficient; the quiz fires immediately.
   */
  async function _agenticStartQuiz(taskIdx) {
    try {
      // Move session to retrieval state so generate_retrieval_questions accepts it.
      // We reuse the existing triggerRetrieval path which calls the questions endpoint.
      // But first we need the session in retrieval state — finishStudyPeriod does that.
      // If there is no active study period (agentic flow skips the timer), we call
      // the questions endpoint directly after forcing a state check.
      const sess = await api.getAISession(sessionId);
      if (sess.status === "studying" && sess.activeStudyPeriod?.id) {
        // Finish the active timer early so the server transitions to retrieval
        await api.finishStudyPeriod(sessionId, sess.activeStudyPeriod.id);
      }
      // Generate questions for the current task index
      const qs = await api.generateRetrievalQuestions(sessionId, 3, taskIdx);
      const arr = Array.isArray(qs) ? qs : (qs.questions || []);
      setQuestions(arr);
      setQIndex(0);
      setAnswerInput("");
      setLastEval(null);
      setSession(prev => ({ ...prev, status: "retrieval" }));
      setPhase("retrieval");
    } catch (err) {
      setError(err.message || "Could not start the quiz. Please try again.");
    } finally {
      setAiWorking(false);
    }
  }

  async function handleStartSuggestedSession() {
    if (!postSuggestion || !session) return;
    setAiWorking(true);
    setPostSuggestion(null);
    try {
      const next = await api.createAISession({
        subjectId:   session.subjectId,
        topicId:     session.topicId,
        conceptId:   session.conceptId,
        familiarity: "revisit",
        intent:      "teach_me",
        studentNote: postSuggestion.note || `Follow-up from previous session. Topic of interest: ${postSuggestion.topic || postSuggestion.subject || "related concept"}`,
      });
      await api.prepareAISession(next.id);
      navigate(`/app/learn/ai/session/${next.id}`);
    } catch (err) {
      setError(err.message || "Could not start focused session.");
      setAiWorking(false);
    }
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
      // The unanswered question is rendered as the Quick Check card.
      // It becomes normal chat history only after submission.
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
    const studentAnswer = answerInput.trim();

    try {
      const evaluation = await api.submitAnswer(sessionId, question.id, studentAnswer, null);
      const result = {
        ...evaluation,
        questionId: question.id,
        question: question.question,
        questionType: question.questionType,
        options: question.options || null,
        studentAnswer,
      };

      setCheckResults(prev => ({ ...prev, [question.id]: result }));
      setAnswerInput("");
      setLastEval(evaluation);

      // The Quick Check card is a temporary interaction. Once submitted,
      // replace it with natural AI/student chat turns instead of a result pill.
      setMessages(prev => [...prev, ...buildQuizChatMessages(questions, [result])]);

      const sess = await api.getAISession(sessionId);
      setSession(sess);

      if (evaluation.needsReteach) {
        setPhase("reteaching");
        await doReteach(
          evaluation.misconception,
          evaluation.recommendedStrategy,
          currentTaskIndex
        );
      } else {
        setCompletedTaskIndexes(prev =>
          Array.from(new Set([...prev, currentTaskIndex]))
        );

        const nextIndex = currentTaskIndex + 1;
        if (learningPlan[nextIndex]) {
          // Task passed → immediately teach and start the next task timer.
          await handleStartTask(learningPlan[nextIndex], nextIndex);
        } else {
          await doSummary();
        }
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function doReteach(misconception, recommendedStrategy, taskIndex = currentTaskIndex) {
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
      // Return to teaching phase — the AI will signal start_quiz again
      // when it judges the student has understood the reteach content.
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

      // The server marks the session completed when the summary is generated.
      // Reload the completed session so the previously hidden teaching history
      // becomes visible again. The summary stays out of the chat transcript.
      const freshSession = await api.getAISession(sessionId);
      let freshMessages = Array.isArray(freshSession?.messages) ? freshSession.messages : [];
      try {
        const fetched = await api.getSessionMessages(sessionId);
        if (Array.isArray(fetched)) freshMessages = fetched;
      } catch (messageErr) {
        console.warn("Could not reload completed messages; using session snapshot.", messageErr);
      }

      setSummary(s || freshSession?.summary || null);
      setSession(freshSession);
      setMessages([
        ...freshMessages,
        ...buildQuizChatMessages(freshSession?.questions || questions, freshSession?.answers || []),
      ]);
      setPhase("summary");
      setLastEval(null);
      setAnswerInput("");
    } catch (err) {
      setError(err.message || "Failed to generate summary.");
    } finally {
      setAiWorking(false);
    }
  }

  async function handlePracticeAgain() {
    if (!session) return;
    setAiWorking(true);
    setError(null);
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
      setError(err.message || "Could not start another practice session.");
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

  function isQuizRequest(text) {
    return /\b(give me (a )?quiz|quiz me|test me|test my knowledge)\b/i.test(text || "");
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

  // Chat is available during teaching, reteaching, and summary.
  // The AI reads these messages to judge when to trigger the quiz.
  const canType = (phase === "teaching" || phase === "reteaching" || phase === "summary") && !aiWorking;

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
          <span className="wa-topbar-name">UPRAD</span>
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
          .filter(m => !["welcome", "system", "timer_start", "timer_end", "summary"].includes(m.messageType))
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
          <LearningPlanPanel
            tasks={learningPlan}
            completedTaskIndexes={completedTaskIndexes}
            currentTaskIndex={currentTaskIndex}
            onStartTask={handleStartTask}
          />
        )}

        {phase === "studying" && (
          <StudyTimerPanel
            seconds={timerSeconds}
            totalSeconds={studyPeriod?.durationSeconds || 300}
            paused={timerPaused}
            onTogglePause={toggleTimerPause}
            task={learningPlan[currentTaskIndex]}
          />
        )}

        {(phase === "retrieval" || phase === "practice") && (
          questions.length > 0 ? (
            <RetrievalPanel
              question={questions[qIndex]}
              questionNumber={qIndex + 1}
              totalQuestions={questions.length}
              questions={questions}
              answer={answerInput}
              setAnswer={setAnswerInput}
              onSubmit={handleSubmitAnswer}
              submitting={submitting}
              results={checkResults}
            />
          ) : (
            <div className="wa-action-card">
              <button className="wa-btn-primary" onClick={handleStartRetrieval} disabled={aiWorking}>
                {aiWorking ? "Generating questions…" : "Start Recall Check"}
              </button>
            </div>
          )
        )}



        {phase === "summary" && summary && (
          <>
            <SessionCompleteBar
              summary={summary}
              onViewSummary={() => setShowSummary(true)}
            />
            {showSummary && (
              <SummaryModal
                summary={summary}
                conceptName={conceptName}
                onClose={() => setShowSummary(false)}
                onContinue={() => navigate("/app/learn/ai")}
                onPracticeAgain={handlePracticeAgain}
                onBackToTopic={() => navigate(-2)}
              />
            )}
          </>
        )}

        {phase === "summary" && !summary && aiWorking && (
          <div className="wa-system-card">
            <TypingIndicator label="Generating your session summary…" inline />
          </div>
        )}

        {/* Post-session new-session suggestion — shown once after AI flags it */}
        {postSuggestion && !aiWorking && (
          <PostSessionSuggestion
            subject={postSuggestion.subject}
            topic={postSuggestion.topic}
            onStart={handleStartSuggestedSession}
            onDismiss={() => setPostSuggestion(null)}
          />
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
              phase === "summary"                                    ? "Ask a follow-up question…" :
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
            {msg.messageType === "reteach"       ? "UPRAD · New Approach" :
             msg.messageType === "question_ask"  ? "UPRAD · Question" :
             "UPRAD"}
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
        <span className="wa-bubble-sender">UPRAD</span>
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

function LearningPlanPanel({ tasks, completedTaskIndexes, currentTaskIndex, onStartTask }) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return (
      <div className="wa-action-card wa-plan-empty">
        <span className="wa-plan-empty-icon">✦</span>
        <strong>UPRAD is mapping this concept…</strong>
        <p>The learning tasks will appear here in a moment.</p>
      </div>
    );
  }

  return (
    <section className="wa-learning-plan" aria-label="Learning plan">
      <div className="wa-plan-header">
        <div>
          <span className="wa-plan-kicker">YOUR LEARNING PLAN</span>
          <h3>Master this concept step by step</h3>
          <p>Each task has its own focused study period and recall check.</p>
        </div>
        <span className="wa-plan-count">{completedTaskIndexes.length}/{tasks.length}</span>
      </div>

      <div className="wa-plan-list">
        {tasks.map((task, index) => {
          const done = completedTaskIndexes.includes(index);
          const active = index === currentTaskIndex && !done;
          const locked = index > 0 && !completedTaskIndexes.includes(index - 1);
          return (
            <div
              key={task.id || index}
              className={`wa-plan-task${done ? " is-done" : ""}${active ? " is-active" : ""}${locked ? " is-locked" : ""}`}
            >
              <div className="wa-plan-task-marker">
                {done ? "✓" : locked ? "🔒" : index + 1}
              </div>
              <div className="wa-plan-task-copy">
                <strong>{task.title}</strong>
                <span>{task.description || task.focus}</span>
                <small>⏱ {task.recommendedMinutes || 5} min · Recall check</small>
              </div>
              {!done && !locked && (
                <button
                  type="button"
                  className="wa-plan-task-btn"
                  onClick={() => onStartTask(task, index)}
                >
                  {active ? "Study" : "Start"}
                </button>
              )}
              {done && <span className="wa-plan-done">Done</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// TeachingActions is no longer rendered — the AI drives quiz timing autonomously.
// Kept as a no-op to avoid breaking any residual references.
function TeachingActions({ onStartStudy, onAction }) {
  return null;
}

function StudyTimerPanel({ seconds, totalSeconds, paused, onTogglePause, task }) {
  const pct = totalSeconds > 0 ? seconds / totalSeconds : 0;
  const isWarning = seconds > 0 && seconds <= 60;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secondDeg = (secs / 60) * 360;
  const minuteDeg = ((minutes % 60) / 60) * 360 + (secs / 60) * 6;
  const hourDeg = (((minutes % 60) / 60) * 30) + ((secs / 60) * 0.5);

  return (
    <section className="wa-task-timer" aria-label="Study timer">
      <div className="wa-task-timer-header">
        <div>
          <span className="wa-plan-kicker">TASK {task?.order || 1} · STUDY</span>
          <h3>{task?.title || "Focus on this task"}</h3>
          <p>{task?.focus || task?.description || "Read and understand the explanation above."}</p>
        </div>
        <span className="wa-timer-status">{paused ? "Paused" : "Learning"}</span>
      </div>

      <div className="wa-clock-wrap">
        <svg className="wa-real-clock" viewBox="0 0 220 220" role="img" aria-label={`${formatTime(seconds)} remaining`}>
          <circle cx="110" cy="110" r="96" className="wa-clock-face" />
          <circle cx="110" cy="110" r="96" className="wa-clock-progress"
            strokeDasharray={`${2 * Math.PI * 96 * pct} ${2 * Math.PI * 96}`} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = i * 30;
            const outer = 84;
            const inner = i % 3 === 0 ? 70 : 76;
            const x1 = 110 + Math.sin(a * Math.PI / 180) * inner;
            const y1 = 110 - Math.cos(a * Math.PI / 180) * inner;
            const x2 = 110 + Math.sin(a * Math.PI / 180) * outer;
            const y2 = 110 - Math.cos(a * Math.PI / 180) * outer;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={`wa-clock-tick${i % 3 === 0 ? " major" : ""}`} />;
          })}
          <g transform={`rotate(${hourDeg} 110 110)`}>
            <line x1="110" y1="110" x2="110" y2="69" className="wa-clock-hand wa-clock-hour" />
          </g>
          <g transform={`rotate(${minuteDeg} 110 110)`}>
            <line x1="110" y1="110" x2="110" y2="51" className="wa-clock-hand wa-clock-minute" />
          </g>
          <g transform={`rotate(${secondDeg} 110 110)`}>
            <line x1="110" y1="118" x2="110" y2="43" className="wa-clock-hand wa-clock-second" />
          </g>
          <circle cx="110" cy="110" r="6" className="wa-clock-pin" />
        </svg>
        <div className="wa-clock-digital">
          <strong>{String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}</strong>
          <span>{isWarning ? "Almost done" : "Focus time"}</span>
        </div>
      </div>

      <div className="wa-task-timer-footer">
        <span>When time ends, UPRAD will hide the explanation and test your recall.</span>
        <button type="button" className="wa-btn-secondary" onClick={onTogglePause}>
          {paused ? "Resume timer" : "Pause timer"}
        </button>
      </div>
    </section>
  );
}

function buildQuizChatMessages(questions = [], answers = []) {
  const byId = new Map(questions.map(q => [Number(q.id), q]));
  return answers
    .map((result, offset) => {
      const question = byId.get(Number(result.questionId)) || result;
      if (!question?.question || result?.studentAnswer == null) return null;
      const index = questions.findIndex(q => Number(q.id) === Number(result.questionId));
      const number = index >= 0 ? index + 1 : offset + 1;
      const total = questions.length || 1;
      const time = result.createdAt || new Date().toISOString();
      return [
        {
          id: `quiz-q-${result.questionId}`,
          role: "ai",
          messageType: "question_ask",
          content: question.question,
          sequence: 20000 + number * 3,
          createdAt: time,
          extra: { questionType: question.questionType, questionNumber: number, totalQuestions: total },
        },
        {
          id: `quiz-a-${result.questionId}-${result.attemptNumber || 1}`,
          role: "student",
          messageType: "quiz_answer",
          content: formatQuizStudentAnswer(question, result.studentAnswer),
          sequence: 20000 + number * 3 + 1,
          createdAt: time,
        },
        {
          id: `quiz-f-${result.questionId}-${result.attemptNumber || 1}`,
          role: "ai",
          messageType: "feedback",
          content: result.feedback || "Answer recorded.",
          sequence: 20000 + number * 3 + 2,
          createdAt: time,
          extra: {
            score: result.score,
            understanding: result.understanding,
          },
        },
      ];
    })
    .filter(Boolean)
    .flat();
}

function formatQuizStudentAnswer(question, answer) {
  if (question?.questionType === "multiple_choice" && Array.isArray(question.options)) {
    const match = question.options.find((opt, index) => {
      const label = typeof opt === "string" ? String.fromCharCode(65 + index) : opt.label;
      const text = typeof opt === "string" ? opt : opt.text;
      return answer === label || answer === text;
    });
    if (match) {
      const index = question.options.indexOf(match);
      const label = typeof match === "string" ? String.fromCharCode(65 + index) : match.label;
      const text = typeof match === "string" ? match : match.text;
      return `${label} · ${text}`;
    }
  }
  return answer;
}

function QuickCheckHistory({ questions = [], results = {} }) {
  const [expandedId, setExpandedId] = useState(null);
  const answered = questions.map((q, index) => ({ q, index, result: results[q.id] })).filter(x => x.result);
  if (!answered.length) return null;
  return (
    <section className="wa-check-history-only" aria-label="Quick check results">
      <div className="wa-check-heading">
        <div className="wa-check-rule" /><span>QUICK CHECK · RESULTS</span><div className="wa-check-rule" />
      </div>
      {answered.map(({ q, index, result }) => {
        const status = statusForResult(result);
        const expanded = expandedId === q.id;
        return (
          <div className="wa-check-result" key={`history-${q.id}`}>
            <button type="button" className={`wa-check-result-row wa-check-result-row--${status.key}`}
              onClick={() => setExpandedId(expanded ? null : q.id)} aria-expanded={expanded}>
              <span className="wa-check-result-icon">{status.icon}</span>
              <span className="wa-check-result-main">
                <span className="wa-check-result-label">Q{index + 1} · {status.label}</span>
                {!expanded && <span className="wa-check-result-preview">{q.question}</span>}
              </span>
              {result.score != null && <span className="wa-check-result-score">{result.score}/100</span>}
              <span className="wa-check-result-review">{expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
            </button>
            {expanded && <ReviewDetails question={q} result={result} />}
          </div>
        );
      })}
    </section>
  );
}

function statusForResult(result) {
  if (result.isCorrect === true || result.understanding === "strong") return { key: "strong", label: "Correct", icon: "✓" };
  if (result.understanding === "weak" || result.needsReteach || (result.score != null && result.score < 50)) return { key: "weak", label: "Needs practice", icon: "✕" };
  return { key: "partial", label: "Getting there", icon: "◐" };
}

function RetrievalPanel({
  question, questionNumber, totalQuestions, questions = [], answer, setAnswer, onSubmit, submitting, results = {},
}) {
  const [expandedId, setExpandedId] = useState(null);
  if (!question) return null;
  const answered = questions.map((q, index) => ({ q, index, result: results[q.id] })).filter(x => x.result);
  return (
    <section className="wa-check-flow" aria-label={`Quick check, ${totalQuestions} questions`}>
      <div className="wa-check-heading"><div className="wa-check-rule" /><span>QUICK CHECK · {totalQuestions} QUESTIONS</span><div className="wa-check-rule" /></div>
      <div className="wa-check-history">
        {answered.map(({ q, index, result }) => {
          const status = statusForResult(result);
          const expanded = expandedId === q.id;
          return (
            <div className="wa-check-result" key={`result-${q.id}`}>
              <button type="button" className={`wa-check-result-row wa-check-result-row--${status.key}`}
                onClick={() => setExpandedId(expanded ? null : q.id)} aria-expanded={expanded}>
                <span className="wa-check-result-icon">{status.icon}</span>
                <span className="wa-check-result-main">
                  <span className="wa-check-result-label">Q{index + 1} · {status.label}</span>
                  {!expanded && <span className="wa-check-result-preview">{q.question}</span>}
                </span>
                {result.score != null && <span className="wa-check-result-score">{result.score}/100</span>}
                <span className="wa-check-result-review">{expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
              </button>
              {expanded && <ReviewDetails question={q} result={result} />}
            </div>
          );
        })}
      </div>
      <div className="wa-check-card">
        <div className="wa-check-progress" aria-hidden="true">{Array.from({ length: totalQuestions }, (_, i) => <span key={i} className={i < questionNumber - 1 ? "is-complete" : i === questionNumber - 1 ? "is-current" : ""} />)}</div>
        <div className="wa-check-card-header"><div className="wa-check-kicker">Q{questionNumber} OF {totalQuestions} · {formatQType(question.questionType).toUpperCase()}</div><h3>{question.question}</h3></div>
        {question.questionType === "multiple_choice" && question.options?.length > 0 ? (
          <div className="wa-check-options" role="radiogroup" aria-label="Choose your answer">
            {question.options.map((opt, index) => {
              const value = typeof opt === "string" ? opt : opt.label; const text = typeof opt === "string" ? opt : opt.text; const label = typeof opt === "string" ? String.fromCharCode(65 + index) : opt.label; const selected = answer === value;
              return <button type="button" key={`${question.id}-${label}`} role="radio" aria-checked={selected} className={`wa-check-option${selected ? " selected" : ""}`} onClick={() => setAnswer(value)} disabled={submitting}><span className="wa-check-option-letter">{label}</span><span>{text}</span></button>;
            })}
          </div>
        ) : (
          <div className="wa-check-open-answer"><span className="wa-check-open-label">Explain in your own words</span><textarea className="wa-check-textarea" placeholder="Write your answer in your own words…" value={answer} onChange={e => setAnswer(e.target.value)} rows={4} disabled={submitting} /><span className="wa-check-word-count">{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : "Open answer"}</span></div>
        )}
        <div className="wa-check-submit-row"><button type="button" className="wa-check-submit" onClick={onSubmit} disabled={!answer.trim() || submitting}>{submitting ? "Checking…" : "Submit"}</button></div>
      </div>
    </section>
  );
}

function ReviewDetails({ question, result }) {
  const options = Array.isArray(question.options) ? question.options : [];
  const isMC = question.questionType === "multiple_choice" && options.length > 0;
  const correct = result.correctOptionLabel || result.correctAnswer || null;
  if (isMC) return <div className="wa-check-review">
    <div className="wa-check-review-question">{question.question}</div>
    <div className="wa-check-review-options">
      {options.map((opt, index) => {
        const label = typeof opt === "string" ? String.fromCharCode(65 + index) : opt.label; const text = typeof opt === "string" ? opt : opt.text;
        const selected = result.studentAnswer === label || result.studentAnswer === text; const correctOption = correct && (correct === label || correct === text || correct === `Option ${label}`);
        const cls = correctOption ? "correct" : selected && result.isCorrect === false ? "wrong" : selected && result.isCorrect !== false ? "correct" : "";
        return <div className={`wa-check-review-option ${cls}`} key={`${question.id}-review-${label}`}><span className="wa-check-review-letter">{correctOption || (selected && result.isCorrect) ? "✓" : selected ? "✕" : label}</span><span>{text}</span>{selected && <small>Your answer</small>}{correctOption && !selected && <small>Correct answer</small>}</div>;
      })}
    </div>
    {result.feedback && <div className="wa-check-review-feedback"><strong>UPRAD</strong><p>{result.feedback}</p></div>}
  </div>;
  return <div className="wa-check-review"><div className="wa-check-review-question">{question.question}</div><div className="wa-check-answer-label">YOUR ANSWER</div><div className="wa-check-student-answer">{result.studentAnswer}</div>{result.feedback && <div className="wa-check-review-feedback"><strong>UPRAD</strong><p>{result.feedback}</p></div>}{result.score != null && <span className={`wa-check-review-score wa-check-review-score--${result.understanding || "partial"}`}>{statusText(result)} · {result.score}/100</span>}</div>;
}

function statusText(result) {
  if (result.isCorrect === true || result.understanding === "strong") return "Correct";
  if (result.understanding === "weak" || result.needsReteach || (result.score != null && result.score < 50)) return "Needs practice";
  return "Getting there";
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

function PostSessionSuggestion({ subject, topic, onStart, onDismiss }) {
  const label = topic && subject
    ? `${topic} · ${subject}`
    : topic || subject || "a different topic";
  return (
    <div className="wa-post-suggestion">
      <div className="wa-post-suggestion-body">
        <span className="wa-post-suggestion-icon">✦</span>
        <p>This looks like a <strong>{label}</strong> question. Want a focused session on it?</p>
      </div>
      <div className="wa-post-suggestion-actions">
        <button className="wa-btn-primary wa-post-suggestion-start" onClick={onStart}>
          Start focused session
        </button>
        <button className="wa-post-suggestion-dismiss" onClick={onDismiss}>
          No thanks
        </button>
      </div>
    </div>
  );
}

function SessionCompleteBar({ summary, onViewSummary }) {
  const score = summary?.overallScore;
  const scoreTone = score >= 70 ? "strong" : score >= 50 ? "partial" : "weak";
  return (
    <button type="button" className="wa-session-complete-bar" onClick={onViewSummary}>
      <span className={`wa-session-complete-icon wa-session-complete-icon--${scoreTone}`}>✓</span>
      <span className="wa-session-complete-copy">
        <strong>Session complete</strong>
        <span>{score != null ? `${score}/100 overall` : "View your session summary"}</span>
      </span>
      <span className="wa-session-complete-action">View summary →</span>
    </button>
  );
}

function SummaryModal({ summary, conceptName, onClose, onContinue, onPracticeAgain, onBackToTopic }) {
  return (
    <div className="wa-summary-overlay" role="dialog" aria-modal="true" aria-label="Session summary">
      <button className="wa-summary-backdrop" aria-label="Close summary" onClick={onClose} />
      <section className="wa-summary-modal">
        <div className="wa-summary-modal-head">
          <div>
            <span className="wa-summary-eyebrow">SESSION SUMMARY</span>
            <h2>{conceptName}</h2>
          </div>
          <button type="button" className="wa-summary-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {summary.overallScore != null && (
          <div className="wa-summary-score-card">
            <div>
              <span className="wa-summary-score-label">Overall score</span>
              <strong>{summary.overallScore}<small>/100</small></strong>
            </div>
            <span className="wa-summary-score-meta">
              {summary.questionsCorrect} of {summary.questionsAnswered} correct
            </span>
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
            <h3>Needs more practice</h3>
            <ul>{summary.areasForPractice.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}

        {summary.keyIdeas?.length > 0 && (
          <div className="wa-summary-section">
            <h3>Key ideas</h3>
            <ul>{summary.keyIdeas.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
        )}

        {summary.recommendedNext && (
          <div className="wa-summary-section">
            <h3>Recommended next step</h3>
            <p>{summary.recommendedNext}</p>
          </div>
        )}

        <div className="wa-summary-modal-actions">
          <button className="wa-btn-primary" onClick={onContinue}>Continue Learning</button>
          <button className="wa-btn-secondary" onClick={onPracticeAgain}>Practice Again</button>
          <button className="wa-chip" onClick={onBackToTopic}>Back to Topic</button>
        </div>
      </section>
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

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
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
