/**
 * AI Learning Room — mobile-first rebuild v2
 * - Chat layout: AI messages plain, student messages in card
 * - Icon row under each AI message: copy · play · save
 * - Read aloud: robust voice loading (handles mobile async voiceschanged)
 * - Idle nudge: simplified guard, console logging for debug
 * - Typewriter animation for new AI messages
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

/* ─── Typewriter hook ─────────────────────────────────────────────────── */
function useTypewriter(targetText, active) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const frameRef = useRef(null);
  const indexRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    if (!active) {
      setDisplayed(targetText || "");
      setDone(true);
      return;
    }
    indexRef.current = 0;
    setDisplayed("");
    setDone(false);
    const target = targetText || "";
    function tick() {
      const i = indexRef.current;
      if (i >= target.length) { setDone(true); return; }
      const burst = Math.min(4, target.length - i);
      setDisplayed(target.slice(0, i + burst));
      indexRef.current += burst;
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [targetText, active]);

  return { displayed, done };
}

/* ─── Robust TTS (handles mobile async voice loading) ────────────────── */
function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  const clean = String(text)
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/[#*_`~>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return;

  function doSpeak() {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter(v => /^en/i.test(v.lang));
    const pool = english.length ? english : voices;
    const preferred = ["Aria", "Jenny", "Guy", "Samantha", "Karen", "Daniel", "Google UK", "Google US"];
    const voice = pool.find(v => preferred.some(n => v.name.includes(n)))
      || pool.find(v => /natural|neural|enhanced|premium/i.test(v.name))
      || pool[0];
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 0.95; u.pitch = 1; u.volume = 1;
    window.speechSynthesis.speak(u);
  }

  // Voices may not be loaded yet on mobile Chrome
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    doSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
    // Fallback: try anyway after short delay
    setTimeout(doSpeak, 300);
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */
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
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem("peerup.learningRoom.ttsEnabled") === "true"; } catch { return false; }
  });
  const [isTyping, setIsTyping] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [leftOpen, setLeftOpen] = useState(() => {
    try { return localStorage.getItem("peerup.learningRoom.leftOpen") !== "false"; } catch { return true; }
  });
  const [rightOpen, setRightOpen] = useState(() => {
    try { return localStorage.getItem("peerup.learningRoom.rightOpen") !== "false"; } catch { return true; }
  });
  const [copiedId, setCopiedId] = useState(null);
  const [savedMessageIds, setSavedMessageIds] = useState(() => new Set());
  const [typingMessageId, setTypingMessageId] = useState(null);

  const bottomRef = useRef(null);
  const timerRef = useRef(null);
  const ttsRef = useRef(false);
  const idleTimerRef = useRef(null);
  const typingDebounceRef = useRef(null);
  const idleNudgeRef = useRef(0);
  const spokenGroupsRef = useRef(new Set());
  const lastAiSeqRef = useRef(null);
  const revealTimersRef = useRef([]);
  const aiWorkingRef = useRef(false);
  const isTypingRef = useRef(false);
  const phaseRef = useRef(phase);

  // Keep refs in sync so idle timer closure is always fresh
  useEffect(() => { aiWorkingRef.current = aiWorking; }, [aiWorking]);
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function toggleLeftSidebar() {
    setLeftOpen(prev => { const n = !prev; try { localStorage.setItem("peerup.learningRoom.leftOpen", String(n)); } catch {} return n; });
  }
  function toggleRightSidebar() {
    setRightOpen(prev => { const n = !prev; try { localStorage.setItem("peerup.learningRoom.rightOpen", String(n)); } catch {} return n; });
  }

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
    ttsRef.current = ttsEnabled;
    try { localStorage.setItem("peerup.learningRoom.ttsEnabled", String(ttsEnabled)); } catch {}
  }, [ttsEnabled]);

  /* ── Idle nudge ─────────────────────────────────────────────────────── */
  useEffect(() => {
    clearTimeout(idleTimerRef.current);

    if (!session) return;
    if (!["teaching", "reteaching"].includes(phase)) return;
    if (aiWorking || isTyping) return;

    const ordered = [...messages].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const latest = ordered[ordered.length - 1];

    // Only fire when the last message is from AI (student hasn't replied yet)
    if (!latest || latest.role !== "ai" || latest.messageType === "feedback") return;

    const latestSeq = Number(latest.sequence || 0);
    const isNudge = latest.messageType === "idle_nudge";

    if (isNudge) {
      const n = Number(latest.extra?.idleNudgeNumber || 1);
      idleNudgeRef.current = n;
      lastAiSeqRef.current = latestSeq;
      if (n >= 2) return; // Already sent max nudges
    } else if (lastAiSeqRef.current !== latestSeq) {
      lastAiSeqRef.current = latestSeq;
      idleNudgeRef.current = 0;
    }

    const delay = idleNudgeRef.current === 0 ? 30000 : 45000;
    console.log(`[IdleNudge] Scheduling nudge #${idleNudgeRef.current + 1} in ${delay / 1000}s`);

    async function fireIdleNudge() {
      // Re-check live refs at fire time
      if (aiWorkingRef.current || isTypingRef.current) {
        idleTimerRef.current = setTimeout(fireIdleNudge, 5000);
        return;
      }
      if (!["teaching", "reteaching"].includes(phaseRef.current)) return;

      const nextNudge = idleNudgeRef.current + 1;
      if (nextNudge > 2) return;
      console.log(`[IdleNudge] Firing nudge #${nextNudge}`);
      try {
        const nudge = await api.createLearningIdleNudge(sessionId, nextNudge);
        idleNudgeRef.current = nextNudge;
        setMessages(prev => prev.some(m => m.id === nudge.id) ? prev : [...prev, nudge]);
        if (ttsRef.current) speakText(nudge.content || "");
        console.log(`[IdleNudge] Nudge #${nextNudge} added`);
      } catch (e) {
        console.warn("[IdleNudge] Failed:", e?.message);
      }
    }

    idleTimerRef.current = setTimeout(fireIdleNudge, delay);
    return () => clearTimeout(idleTimerRef.current);
  }, [sessionId, session, messages, aiWorking, isTyping, phase]);

  useEffect(() => {
    loadSession();
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(idleTimerRef.current);
      clearTimeout(typingDebounceRef.current);
      revealTimersRef.current.forEach(clearTimeout);
      window.speechSynthesis?.cancel();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!aiWorking) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, phase, currentQuestion?.id]);

  async function handleSaveExplanation(msg) {
    const messageId = Number(msg?.id);
    if (!Number.isInteger(messageId) || messageId <= 0) { setError("This explanation cannot be saved yet."); return; }
    try {
      const result = await api.toggleSaved("explanation", messageId);
      setSavedMessageIds(prev => {
        const next = new Set(prev);
        if (result?.saved) next.add(messageId); else next.delete(messageId);
        return next;
      });
    } catch (err) { setError(err?.message || "Couldn't save."); }
  }

  async function loadSession() {
    setLoading(true); setError(null);
    try {
      const sess = await api.getAISession(sessionId);
      let msgs = Array.isArray(sess?.messages) ? sess.messages : [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) msgs = s; } catch {}
      applySession(sess, msgs);
      try { const saved = await api.getSaved(); setSavedMessageIds(new Set((saved?.explanations || []).map(i => Number(i.messageId)))); } catch {}
      if (sess.status === "created") {
        await prepareSession();
      } else {
        const persistedIndex = Number(sess?.learningState?.currentTaskIndex);
        const taughtIndexes = msgs
          .filter(m => m?.role === "ai" && (m?.messageType === "teaching" || m?.messageType === "reteach") && m?.extra?.taskIndex != null)
          .map(m => Number(m.extra.taskIndex)).filter(Number.isInteger);
        if (sess.status === "teaching" && Number.isInteger(persistedIndex) && persistedIndex > -1 && !taughtIndexes.includes(persistedIndex)) {
          setAiWorking(true);
          try {
            await api.teachConcept(sessionId, persistedIndex);
            const fresh = await api.getAISession(sessionId);
            let fMsgs = fresh?.messages || [];
            try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) fMsgs = s; } catch {}
            applySession(fresh, fMsgs);
          } finally { setAiWorking(false); }
        }
      }
    } catch (err) { setError(err.message || "Could not open this learning room."); }
    finally { setLoading(false); }
  }

  async function prepareSession() {
    setAiWorking(true); setPhase("preparing");
    try {
      await api.prepareAISession(sessionId);
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) msgs = s; } catch {}
      applySession(fresh, msgs);
      const firstGroup = msgs.find(m => m.role === "ai" && m.extra?.responseGroupId)?.extra?.responseGroupId;
      if (firstGroup && ttsRef.current) speakGroupMessages(msgs, firstGroup);
    } catch (err) { setError(err.message || "The AI tutor could not prepare this lesson."); }
    finally { setAiWorking(false); }
  }

  function applySession(sess, msgs) {
    setSession(sess);
    const safe = Array.isArray(msgs) ? msgs : [];
    setMessages(safe);
    const plan = sess?.teaching?.learningPlan || safe.slice().reverse().map(m => m?.extra?.learningPlan).find(p => Array.isArray(p) && p.length) || [];
    if (Array.isArray(plan)) setLearningPlan(plan);
    const state = sess?.learningState || null;
    if (state && Number.isInteger(Number(state.currentTaskIndex))) {
      setCurrentTaskIndex(Number(state.currentTaskIndex));
    } else {
      const marker = safe.filter(m => m?.extra?.currentTaskIndex != null || ((m?.messageType === "teaching" || m?.messageType === "reteach" || m?.messageType === "timer_start") && m?.extra?.taskIndex != null)).slice(-1)[0];
      const idx = marker?.extra?.currentTaskIndex ?? marker?.extra?.taskIndex;
      if (idx != null) setCurrentTaskIndex(Number(idx));
    }
    const nextPhase = statusToPhase(sess?.status, safe.some(m => m.messageType === "teaching" || m.messageType === "reteach"));
    setPhase(nextPhase);
    if (Array.isArray(sess?.answers)) {
      const restored = {};
      sess.answers.forEach(item => { if (item?.questionId != null) restored[Number(item.questionId)] = item; });
      setCheckResults(restored);
    }
    const persistedCompleted = Array.isArray(state?.completedTaskIndexes)
      ? state.completedTaskIndexes.map(Number).filter(Number.isInteger)
      : safe.filter(m => m?.role === "ai" && m?.extra?.taskCompleted === true && Number.isInteger(Number(m.extra.taskIndex))).map(m => Number(m.extra.taskIndex));
    setCompletedTaskIndexes([...new Set(persistedCompleted)]);
    if (["practice", "summary"].includes(nextPhase) && sess?.questions?.length) {
      const qs = sess.questions;
      setQuestions(qs);
      const answered = new Set((sess.answers || []).map(a => Number(a.questionId)));
      const next = qs.findIndex(q => !answered.has(Number(q.id)));
      setQIndex(next === -1 ? Math.max(0, qs.length - 1) : next);
    } else if (nextPhase !== "practice") { setQuestions([]); setQIndex(0); setAnswerInput(""); }
  }

  function speakGroupMessages(msgs, groupId) {
    const chunks = (msgs || [])
      .filter(m => m?.role === "ai" && m?.extra?.responseGroupId === groupId)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    if (!chunks.length) return;
    if (spokenGroupsRef.current.has(groupId)) return;
    spokenGroupsRef.current.add(groupId);
    const full = chunks.map(m => m.content || "").join(" ");
    speakText(full);
  }

  function toggleTts() {
    const next = !ttsEnabled;
    ttsRef.current = next;
    setTtsEnabled(next);
    try { localStorage.setItem("peerup.learningRoom.ttsEnabled", String(next)); } catch {}
    if (!next) window.speechSynthesis?.cancel();
  }

  function addLocalMessage(role, content, extra = {}, messageType = "teaching") {
    setMessages(prev => [...prev, {
      id: `local-${Date.now()}-${Math.random()}`,
      role, content, extra, messageType,
      sequence: prev.length + 1,
      createdAt: new Date().toISOString(),
    }]);
  }

  function revealCanonicalMessages(canonical, groupId = null) {
    if (!groupId) { setMessages(canonical); return Promise.resolve(); }
    const chunks = canonical
      .filter(m => m?.role === "ai" && m?.extra?.responseGroupId === groupId)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    if (chunks.length <= 1) {
      setMessages(canonical);
      if (chunks[0]) setTypingMessageId(chunks[0].id);
      return Promise.resolve();
    }
    const rest = canonical.filter(m => m?.extra?.responseGroupId !== groupId);
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];
    setMessages([...rest, chunks[0]]);
    setTypingMessageId(chunks[0].id);
    const delay = 950;
    chunks.slice(1).forEach((chunk, i) => {
      const t = setTimeout(() => { setMessages(prev => [...prev, chunk]); setTypingMessageId(chunk.id); }, delay * (i + 1));
      revealTimersRef.current.push(t);
    });
    const total = delay * chunks.length + 300;
    const ct = setTimeout(() => setTypingMessageId(null), total);
    revealTimersRef.current.push(ct);
    return new Promise(res => setTimeout(res, total));
  }

  async function sendMessage(raw) {
    const content = (raw || msgInput).trim();
    if (!content || aiWorking || !canType) return;
    setMsgInput(""); setError(null); setAiWorking(true); setTypingMessageId(null);
    addLocalMessage("student", content, {}, "question");
    try {
      const msg = await api.sendStudentMessage(sessionId, content);
      const fresh = await api.getAISession(sessionId);
      let canonical = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) canonical = s; } catch {}
      setSession(fresh);
      await revealCanonicalMessages(canonical, msg.extra?.responseGroupId || null);
      if (ttsRef.current) {
        if (msg.extra?.responseGroupId) speakGroupMessages(canonical, msg.extra.responseGroupId);
        else speakText(msg.content || "");
      }
      if (msg.extra?.action === "start_quiz") {
        await beginPractice(msg.extra?.actionData?.task_index ?? currentTaskIndex);
      } else if (msg.extra?.action === "reteach_task") {
        await reteachAfterPractice();
      } else if (msg.extra?.action === "next_task") {
        const nextIndex = Number(msg.extra?.actionData?.task_index);
        if (Number.isInteger(nextIndex) && nextIndex >= 0) {
          setAiWorking(true);
          try {
            await api.teachConcept(sessionId, nextIndex);
            const f = await api.getAISession(sessionId);
            let fMsgs = f?.messages || [];
            try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) fMsgs = s; } catch {}
            setSession(f); setMessages(fMsgs); setCurrentTaskIndex(nextIndex);
            const ps = f?.learningState;
            if (Array.isArray(ps?.completedTaskIndexes)) setCompletedTaskIndexes(ps.completedTaskIndexes.map(Number).filter(Number.isInteger));
            setPhase("teaching");
            const nm = fMsgs.filter(m => m.role === "ai" && Number(m.extra?.taskIndex) === nextIndex);
            const g = nm.find(m => m.extra?.responseGroupId)?.extra?.responseGroupId;
            if (ttsRef.current) { if (g) speakGroupMessages(nm, g); else if (nm.length) speakText(nm.map(m => m.content).join(" ")); }
          } finally { setAiWorking(false); }
        }
      }
    } catch (err) { setError(err.message || "The tutor could not respond."); }
    finally { setAiWorking(false); }
  }

  async function beginPractice(taskIndex = currentTaskIndex) {
    setAiWorking(true); setError(null);
    try {
      const qs = await api.generateRetrievalQuestions(sessionId, 3, taskIndex);
      const arr = Array.isArray(qs) ? qs : (qs?.questions || []);
      if (!arr.length) throw new Error("The tutor could not prepare a practice check.");
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) msgs = s; } catch {}
      setSession(fresh); setMessages(msgs); setQuestions(arr); setQIndex(0); setAnswerInput(""); setPhase("practice");
    } catch (err) { setError(err.message || "Could not start practice mode."); }
    finally { setAiWorking(false); }
  }

  async function submitAnswer() {
    if (!answerInput.trim() || submitting || !currentQuestion) return;
    const answer = answerInput.trim();
    setSubmitting(true); setError(null);
    try {
      const evaluation = await api.submitAnswer(sessionId, currentQuestion.id, answer, null);
      setCheckResults(prev => ({ ...prev, [currentQuestion.id]: { ...evaluation, questionId: currentQuestion.id, studentAnswer: answer, question: currentQuestion.question, questionType: currentQuestion.questionType, options: currentQuestion.options || null } }));
      const fresh = await api.getAISession(sessionId);
      let canonical = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) canonical = s; } catch {}
      setSession(fresh); setMessages(canonical);
      const next = qIndex + 1;
      setAnswerInput("");
      if (next < questions.length) { setQIndex(next); return; }
      await finishPracticeRun();
    } catch (err) { setError(err.message || "Could not evaluate that answer."); }
    finally { setSubmitting(false); }
  }

  async function finishPracticeRun() {
    setAiWorking(true);
    try {
      const result = await api.completePracticeRun(sessionId, questions.map(q => q.id));
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) msgs = s; } catch {}
      setSession(fresh); setMessages(msgs); setPhase("teaching"); setQuestions([]); setQIndex(0); setAnswerInput("");
      const done = msgs.filter(m => m?.role === "ai" && m?.extra?.taskCompleted === true).map(m => Number(m.extra.taskIndex)).filter(Number.isInteger);
      if (done.length) setCompletedTaskIndexes([...new Set(done)]);
      if (result?.needsReteach) await reteachAfterPractice();
    } catch (err) { setError(err.message || "Practice could not be completed."); }
    finally { setAiWorking(false); }
  }

  async function reteachAfterPractice() {
    try {
      const reason = Object.values(checkResults).filter(r => r?.needsReteach).map(r => r?.misconception).filter(Boolean).slice(-2).join("; ") || "The practice run showed partial understanding.";
      await api.generateAdaptiveReteach(sessionId, reason);
      const fresh = await api.getAISession(sessionId);
      let msgs = fresh?.messages || [];
      try { const s = await api.getSessionMessages(sessionId); if (Array.isArray(s)) msgs = s; } catch {}
      setSession(fresh); setMessages(msgs); setPhase("teaching");
      const g = msgs.find(m => m.role === "ai" && m.messageType === "reteach" && m.extra?.responseGroupId)?.extra?.responseGroupId;
      if (ttsRef.current && g) speakGroupMessages(msgs, g);
    } catch (err) { setError(err.message || "The tutor could not start adaptive reteaching."); }
  }

  async function startStudyMode() {
    setError(null); setAiWorking(true);
    try {
      const period = await api.startStudyPeriod(sessionId, 300, currentTaskIndex);
      setSession(prev => ({ ...prev, status: "studying" }));
      setPhase("studying");
      setTimerSeconds(Number(period.durationSeconds || 300));
      runTimer(Number(period.durationSeconds || 300), period.id);
    } catch (err) { setError(err.message || "Could not start study mode."); }
    finally { setAiWorking(false); }
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
    if (!window.confirm("End this session? Your progress will be saved.")) return;
    try { await api.abandonAISession(sessionId); navigate("/app/learn/ai"); }
    catch (err) { setError(err.message || "Could not end the session."); }
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
          <button className="ar-icon-btn" onClick={() => navigate("/app/learn/ai")} aria-label="Back">←</button>
          <div className="ar-brand-avatar"><TutorAvatar size={34} /><span /></div>
          <div className="ar-header-copy">
            <div className="ar-header-title">{conceptName}</div>
            <div className="ar-header-sub">{subjectName}{topicName ? ` · ${topicName}` : ""}</div>
          </div>
        </div>
        <div className="ar-header-center"><span className="ar-live-dot" /><span>{aiWorking ? "UPRAD is working…" : phaseLabel}</span></div>
        <div className="ar-header-right">
          <button className={`ar-icon-btn ar-voice-btn ${ttsEnabled ? "active" : ""}`} onClick={toggleTts} title={ttsEnabled ? "Voice on" : "Voice off"} aria-label="Toggle voice">
            {ttsEnabled ? "🔊" : "🔇"}
          </button>
          <button className="ar-header-action ar-desktop-toggle" onClick={toggleLeftSidebar}>{leftOpen ? "Hide plan" : "Show plan"}</button>
          <button className="ar-header-action ar-desktop-toggle" onClick={toggleRightSidebar}>{rightOpen ? "Hide tools" : "Show tools"}</button>
          <button className="ar-header-action ar-mobile-only" onClick={() => setMobilePanel("plan")}>Plan</button>
          <button className="ar-header-action ar-mobile-only" onClick={() => setMobilePanel("tools")}>Tools</button>
          <button className="ar-end" onClick={endSession}>End</button>
        </div>
      </header>

      <div className={`ar-layout ${leftOpen ? "ar-left-open" : "ar-left-collapsed"} ${rightOpen ? "ar-right-open" : "ar-right-collapsed"}`}>
        {leftOpen && (
          <aside className={`ar-sidebar ar-plan-sidebar ${mobilePanel === "plan" ? "ar-mobile-open" : ""}`}>
            <SidebarPlan plan={learningPlan} current={currentTaskIndex} completed={completedTaskIndexes} progress={planProgress} onClose={() => setMobilePanel(null)} />
            <button type="button" className="ar-sidebar-edge-toggle ar-left-edge-toggle" onClick={toggleLeftSidebar}>‹</button>
          </aside>
        )}
        {!leftOpen && <button type="button" className="ar-sidebar-restore ar-left-restore" onClick={toggleLeftSidebar}>›</button>}

        <main className="ar-main">
          <div className="ar-context-strip">
            <div><span className="ar-eyebrow">LEARNING ROOM</span><strong>{phaseLabel}</strong></div>
            <div className="ar-context-progress">
              <span>{learningPlan.length ? `${completedCount}/${learningPlan.length} steps` : "Continuous"}</span>
              <div><i style={{ width: `${planProgress}%` }} /></div>
            </div>
          </div>

          {teachingLocked && <PracticeBanner />}
          {error && <div className="ar-error"><span>!</span>{error}<button onClick={() => setError(null)}>×</button></div>}

          <section className="ar-conversation" aria-live="polite">
            {messages
              .filter(m => !["welcome", "system", "timer_start", "timer_end", "summary"].includes(m.messageType))
              .map((msg, index) => (
                <MessageCard
                  key={msg.id || index}
                  msg={msg}
                  onCopy={setCopiedId}
                  copiedId={copiedId}
                  onTutorAction={sendMessage}
                  isSaved={savedMessageIds.has(Number(msg.id))}
                  onSave={handleSaveExplanation}
                  isTypingNow={typingMessageId === msg.id}
                  onReadAloud={() => speakText(msg.content || "")}
                />
              ))}

            {aiWorking && <AgentThinking />}
            {phase === "preparing" && <PreparingCard />}
            {phase === "studying" && <StudyCard seconds={timerSeconds} task={currentTask} />}
            {phase === "practice" && currentQuestion && (
              <QuizArtifact question={currentQuestion} index={qIndex} total={questions.length} answer={answerInput} setAnswer={setAnswerInput} onSubmit={submitAnswer} submitting={submitting} results={checkResults} />
            )}
            <div ref={bottomRef} />
          </section>

          <div className="ar-composer-wrap">
            {phase !== "practice" && (
              <div className="ar-command-row">
                {quickActions.map(([key, label, prompt]) => (
                  <button key={key} className="ar-command-chip" disabled={!canType} onClick={() => sendMessage(prompt)}>{label}</button>
                ))}
              </div>
            )}
            <form className="ar-composer" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
              <textarea
                value={msgInput}
                onChange={e => {
                  setMsgInput(e.target.value);
                  clearTimeout(idleTimerRef.current);
                  setIsTyping(Boolean(e.target.value.trim()));
                  clearTimeout(typingDebounceRef.current);
                  if (e.target.value.trim()) typingDebounceRef.current = setTimeout(() => setIsTyping(false), 3000);
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={!canType}
                rows={1}
                placeholder={phase === "practice" ? "Answer the question above…" : "Talk to UPRAD about what you're learning…"}
              />
              <button className="ar-send" type="submit" disabled={!msgInput.trim() || !canType}>↑</button>
            </form>
          </div>
        </main>

        {rightOpen && (
          <aside className={`ar-sidebar ar-work-sidebar ${mobilePanel === "tools" ? "ar-mobile-open" : ""}`}>
            <WorkspacePanel session={session} task={currentTask} phase={phase} progress={planProgress} familiarity={session?.studentFamiliarity} intent={session?.intent} answeredCount={answeredCount} questionCount={questions.length} onStudy={startStudyMode} onClose={() => setMobilePanel(null)} />
            <button type="button" className="ar-sidebar-edge-toggle ar-right-edge-toggle" onClick={toggleRightSidebar}>›</button>
          </aside>
        )}
        {!rightOpen && <button type="button" className="ar-sidebar-restore ar-right-restore" onClick={toggleRightSidebar}>‹</button>}
      </div>

      {mobilePanel && <button className="ar-mobile-backdrop" onClick={() => setMobilePanel(null)} aria-label="Close panel" />}
    </div>
  );
}

/* ─── MessageCard: plain AI, carded student ──────────────────────────── */
function MessageCard({ msg, onCopy, copiedId, onTutorAction, isSaved, onSave, isTypingNow, onReadAloud }) {
  const ai = msg.role === "ai";
  const locked = ai && msg.extra?.locked;
  const action = msg.extra?.action;
  const msgKey = String(msg.id || "");

  const { displayed, done } = useTypewriter(msg.content || "", ai && isTypingNow);
  const shownContent = (ai && isTypingNow) ? displayed : (msg.content || "");

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(msg.content || "");
      onCopy(msgKey);
      setTimeout(() => onCopy(null), 1400);
    } catch {}
  }

  if (!ai) {
    // Student message — bubble/card on the right
    return (
      <div className="ar-msg-student">
        <div className="ar-msg-student-bubble">
          <RichText content={msg.content} onCopy={onCopy} copiedId={copiedId} />
        </div>
        <time className="ar-msg-time ar-msg-time-right">{formatClock(msg.createdAt)}</time>
      </div>
    );
  }

  // AI message — plain, full-width, icon row below
  return (
    <div className={`ar-msg-ai ${locked ? "ar-msg-ai-locked" : ""}`}>
      <div className="ar-msg-ai-header">
        <div className="ar-msg-ai-avatar"><TutorAvatar size={26} /></div>
        <span className="ar-msg-ai-name">UPRAD</span>
        <span className="ar-msg-ai-role">{locked ? "Practice lock" : msg.messageType === "reteach" ? "Reteach" : msg.messageType === "idle_nudge" ? "Nudge" : "Tutor"}</span>
        <time className="ar-msg-time">{formatClock(msg.createdAt)}</time>
      </div>

      <div className="ar-msg-ai-body">
        {locked && <div className="ar-locked-label">🔒 Teaching temporarily hidden</div>}
        {action && <div className="ar-agent-badge"><span>✦</span>{activityLabel(action)}</div>}
        <RichText content={shownContent} onCopy={onCopy} copiedId={copiedId} />
        {isTypingNow && !done && <span className="ar-cursor-blink">▍</span>}
      </div>

      {/* Icon row: copy · play · save */}
      {!locked && (
        <div className="ar-msg-icons">
          <button
            className={`ar-msg-icon-btn ${copiedId === msgKey ? "ar-icon-active" : ""}`}
            onClick={handleCopy}
            title="Copy"
            aria-label="Copy message"
          >
            {copiedId === msgKey
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            }
          </button>
          <button
            className="ar-msg-icon-btn"
            onClick={onReadAloud}
            title="Read aloud"
            aria-label="Read aloud"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </button>
          <button
            className={`ar-msg-icon-btn ${isSaved ? "ar-icon-saved" : ""}`}
            onClick={() => onSave(msg)}
            title={isSaved ? "Saved" : "Save"}
            aria-label={isSaved ? "Remove from saved" : "Save explanation"}
          >
            {isSaved
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            }
          </button>
        </div>
      )}

      {msg.extra?.taskTransition && (
        <div className="ar-transition-actions">
          <button type="button" onClick={() => onTutorAction("Yes, I'm ready for the next task.")}>Yes, next task →</button>
          <button type="button" className="secondary" onClick={() => onTutorAction("No, please explain again.")}>Explain again</button>
        </div>
      )}
    </div>
  );
}

/* ─── Sidebar components ─────────────────────────────────────────────── */
function SidebarPlan({ plan, current, completed, progress, onClose }) {
  return <div className="ar-panel-inner">
    <div className="ar-panel-head"><div><span className="ar-eyebrow">ROADMAP</span><h2>Learning plan</h2></div><button className="ar-mobile-close" onClick={onClose}>×</button></div>
    <div className="ar-plan-progress"><div className="ar-plan-ring" style={{ "--p": `${progress * 3.6}deg` }}><span>{progress}%</span></div><div><strong>{completed.length} of {plan.length || 0} complete</strong><small>The roadmap is context. UPRAD drives the conversation.</small></div></div>
    <div className="ar-task-list">{plan.length ? plan.map((task, i) => <div key={i} className={`ar-task ${completed.includes(i) ? "done" : current === i ? "active" : ""}`}><span className="ar-task-number">{completed.includes(i) ? "✓" : i + 1}</span><span className="ar-task-copy"><b>{taskTitle(task)}</b><small>{taskDescription(task)}</small><em>{completed.includes(i) ? "Completed" : current === i ? "Current focus" : taskMeta(task)}</em></span></div>) : <div className="ar-empty-plan"><span>✦</span><p>Your tutor is building the learning context.</p></div>}</div>
  </div>;
}

function WorkspacePanel({ session, task, phase, progress, familiarity, intent, answeredCount, questionCount, onStudy, onClose }) {
  return <div className="ar-panel-inner">
    <div className="ar-panel-head"><div><span className="ar-eyebrow">WORKSPACE</span><h2>Session tools</h2></div><button className="ar-mobile-close" onClick={onClose}>×</button></div>
    <div className="ar-current-card"><span className="ar-current-kicker">NOW LEARNING</span><h3>{taskTitle(task) || session?.conceptName || "Building your lesson"}</h3><p>{taskDescription(task) || "Talk with UPRAD. It decides when you're ready."}</p><div className="ar-context-facts">{familiarity && <span>Starting point: {formatFamiliarity(familiarity)}</span>}{intent && <span>Goal: {formatIntent(intent)}</span>}</div><span className={`ar-phase-pill ar-phase-${phase}`}>{phase.replace("_", " ")}</span></div>
    <div className="ar-stats-card"><div><b>{progress}%</b><span>Progress</span></div><div><b>{answeredCount}</b><span>Checks</span></div><div><b>{questionCount}</b><span>This run</span></div></div>
    {(phase === "teaching" || phase === "reteaching") && <button className="ar-study-tool" onClick={onStudy}><span>◷</span><b>Study timer</b><small>5-minute focus before continuing.</small></button>}
    <div className="ar-tool-tip"><b>Stay in the conversation.</b><span>Ask for examples, simpler explanations, or real-world applications. UPRAD decides when to check you.</span></div>
  </div>;
}

/* ─── Rebuilt AgentThinking ──────────────────────────────────────────── */
function AgentThinking() {
  const steps = ["Understanding your response", "Choosing the next teaching move", "Updating your learning path"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="ar-thinking">
      <div className="ar-thinking-avatar"><TutorAvatar size={28} /></div>
      <div className="ar-thinking-body">
        <div className="ar-thinking-label">UPRAD is working</div>
        <div className="ar-thinking-row">
          <span className="ar-thinking-step" key={step}>{steps[step]}</span>
          <div className="ar-thinking-dots"><i /><i /><i /></div>
        </div>
      </div>
    </div>
  );
}

function PracticeBanner() {
  return <div className="ar-practice-banner" role="status"><span>🔒</span><div><strong>PRACTICE MODE</strong><span>Teaching content is hidden. Show what you understand.</span></div></div>;
}
function PreparingCard() { return <div className="ar-preparing-card"><div className="ar-preparing-orb">✦</div><div><span className="ar-eyebrow">BUILDING YOUR LESSON</span><h3>UPRAD is assembling the right starting point</h3><p>It is combining the concept, your starting level, and the learning goal into a focused conversation.</p><div className="ar-loading-line"><i /><i /><i /></div></div></div>; }
function StudyCard({ seconds, task }) { return <div className="ar-study-card"><div className="ar-study-orbit"><span>{formatTime(seconds)}</span><small>Focus</small></div><div className="ar-study-copy"><span className="ar-eyebrow">STUDY MODE</span><h3>{taskTitle(task) || "Study the current idea"}</h3><p>Review what UPRAD taught, then come back to the conversation.</p></div></div>; }

function QuizArtifact({ question, index, total, answer, setAnswer, onSubmit, submitting, results }) {
  const options = Array.isArray(question.options) ? question.options : [];
  const mc = question.questionType === "multiple_choice" && options.length;
  return <section className="ar-quiz-artifact ar-practice-card">
    <div className="ar-artifact-head"><div><span className="ar-eyebrow">PRACTICE · Q{index + 1}</span><h2>Show what you understand</h2></div><span className="ar-quiz-count">{index + 1}/{total}</span></div>
    <div className="ar-quiz-progress">{Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? "done" : i === index ? "current" : ""} />)}</div>
    <div className="ar-quiz-question">{question.question}</div>
    {mc ? <div className="ar-options">{options.map((opt, i) => { const value = typeof opt === "string" ? opt : (opt.value ?? opt.label ?? opt.text); const text = typeof opt === "string" ? opt : (opt.text ?? opt.label ?? opt.value); return <button key={`${question.id}-${i}`} className={`ar-option ${answer === value ? "selected" : ""}`} onClick={() => setAnswer(value)} disabled={submitting}><span>{String.fromCharCode(65 + i)}</span><b>{text}</b></button>; })}</div> : <textarea className="ar-answer-box" rows={5} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Explain your answer in your own words…" disabled={submitting} />}
    <div className="ar-quiz-foot"><span>{Object.keys(results).length} response{Object.keys(results).length !== 1 ? "s" : ""} recorded.</span><button onClick={onSubmit} disabled={!answer.trim() || submitting}>{submitting ? "Evaluating…" : index + 1 === total ? "Finish practice" : "Submit →"}</button></div>
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
    if (lines.every(l => /^[-*]\s+/.test(l.trim()))) return <ul key={i}>{lines.map((line, j) => <li key={j}>{inlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>)}</ul>;
    if (lines.every(l => /^\d+\.\s+/.test(l.trim()))) return <ol key={i}>{lines.map((line, j) => <li key={j}>{inlineMarkdown(line.trim().replace(/^\d+\.\s+/, ""))}</li>)}</ol>;
    return <p key={i}>{inlineMarkdown(trimmed)}</p>;
  })}</div>;
}

function inlineMarkdown(text) { return String(text).split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) => { if ((p.startsWith("**") && p.endsWith("**")) || (p.startsWith("__") && p.endsWith("__"))) return <strong key={i}>{p.slice(2, -2)}</strong>; if ((p.startsWith("*") && p.endsWith("*")) || (p.startsWith("_") && p.endsWith("_"))) return <em key={i}>{p.slice(1, -1)}</em>; if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>; return p; }); }
async function copyText(text, id, onCopy) { try { await navigator.clipboard?.writeText(text); onCopy(id); setTimeout(() => onCopy(null), 1300); } catch {} }
function formatFamiliarity(v) { return ({ new: "new to this", seen_before: "seen it before", know_basics: "basics understood", know_well: "confident", need_help: "needs help" })[v] || v; }
function formatIntent(v) { return ({ teach_me: "learn the concept", explain_simply: "simple explanation", give_examples: "learn through examples", go_deeper: "go deeper", already_know: "probe understanding", quiz_me: "diagnostic first", broaden: "broaden context", custom: "custom goal" })[v] || v; }
function taskTitle(task) { return task?.title || task?.name || task?.concept || task?.task || "Learning step"; }
function taskDescription(task) { return task?.description || task?.objective || task?.goal || task?.summary || "Build understanding and apply the idea."; }
function taskMeta(task) { return task?.estimatedMinutes ? `${task.estimatedMinutes} min` : task?.recommended_minutes ? `${task.recommended_minutes} min` : task?.type || "Guided learning"; }
function activityLabel(action) { return ({ practice_complete: "Practice complete", task_transition: "Ready for next task", reteach_task: "Re-explaining" })[action] || "Tutor action"; }
function formatClock(v) { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatTime(s) { const m = Math.floor(Number(s || 0) / 60); return `${m}:${String(Math.max(0, Number(s || 0) % 60)).padStart(2, "0")}`; }
function RoomSkeleton() { return <div className="ar-room ar-loading"><header className="ar-header"><div className="ar-skeleton ar-sk-circle" /><div className="ar-skeleton ar-sk-title" /></header><div className="ar-loading-layout"><div className="ar-skeleton ar-sk-side" /><div className="ar-sk-chat">{[70, 50, 82, 42].map((w, i) => <div key={i} className="ar-skeleton ar-sk-bubble" style={{ width: `${w}%` }} />)}</div><div className="ar-skeleton ar-sk-side" /></div></div>; }
function ErrorRoom({ message, onBack }) { return <div className="ar-room ar-error-room"><div className="ar-error-card"><span>!</span><h2>Learning room unavailable</h2><p>{message}</p><button onClick={onBack}>Back to AI Learning</button></div></div>; }
