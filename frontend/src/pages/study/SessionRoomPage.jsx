/**
 * SessionRoomPage — /app/rooms/session/:sessionId
 * THE main session room. Renders all phases: concepts, practice, challenge.
 * Polls every 3s to sync state between teacher and learner.
 *
 * Layout: Left panel (role-specific content) + Right chat panel.
 * Chat uses the EXISTING PeerUP chat system via conversationId from the match.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Avatar({ url, name, size = 32 }) {
  const init = (name || "?").charAt(0).toUpperCase();
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
    : <div className="pt-avatar-fb" style={{ width: size, height: size, fontSize: size * 0.4 }}>{init}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat panel (simple WebSocket chat per conversation)
// ─────────────────────────────────────────────────────────────────────────────

function ChatPanel({ convId, partnerName, partnerPhoto }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState("");
  const wsRef   = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!convId) return;
    // Load history
    api.getMessages(convId, null, 50).then(data => {
      setMessages((data.messages || []).reverse());
    }).catch(() => {});
    // Open WS
    const ws = api.openChatSocket(convId, msg => {
      if (msg.type === "message") {
        setMessages(prev => [...prev, msg.message]);
      }
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim() || !convId) return;
    const t = text.trim();
    setText("");
    try { await api.sendMessageRest(convId, t); }
    catch { /* ignore — WS will push it */ }
  }

  if (!convId) return (
    <div className="pt-chat-panel pt-chat-empty">
      <p>Chat not available</p>
    </div>
  );

  return (
    <div className="pt-chat-panel">
      <div className="pt-chat-header">
        <Avatar url={partnerPhoto} name={partnerName} size={28} />
        <span className="pt-chat-partner-name">{partnerName}</span>
      </div>
      <div className="pt-chat-messages">
        {messages.map((m, i) => {
          const mine = String(m.senderId) === String(user?.uid);
          return (
            <div key={m.id || i} className={`pt-chat-msg ${mine ? "mine" : "theirs"}`}>
              <div className="pt-chat-bubble">{m.body}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form className="pt-chat-input-row" onSubmit={send}>
        <input
          className="pt-chat-input"
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button className="pt-chat-send" type="submit" disabled={!text.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPTS PHASE — Teacher panel
// ─────────────────────────────────────────────────────────────────────────────

function TeacherConceptPanel({ session, concept, concepts, onAskLearner, onVerdictSent }) {
  const conceptIdx   = session.currentConceptIdx ?? 0;
  const total        = concepts.length;
  const allResults   = session.results || [];
  // Latest result for this concept (from learner, not yet teacher-verdicted)
  const pendingResult = allResults
    .filter(r => r.conceptId === concept.id && r.teacherVerdict === null && r.userId === session.learnerId)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;

  const [comment, setComment] = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");
  const [teacherTriggered, setTeacherTriggered] = useState(false);

  // Related misconceptions
  const topicMisconceptions = (session.topic?.misconceptions || []).filter(
    m => !m.conceptId || m.conceptId === concept.id
  );

  async function handleAsk() {
    setTeacherTriggered(true);
    onAskLearner(concept.id);
  }

  async function handleVerdict(verdict) {
    setBusy(true); setErr("");
    try {
      await api.submitTeacherVerdict(session.id, concept.id, {
        verdict,
        teacherComment: comment.trim(),
      });
      setComment("");
      onVerdictSent();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="pt-left-panel">
      <div className="pt-concept-header">
        <span className="pt-concept-counter">Concept {conceptIdx + 1} of {total}</span>
        <span className="pt-concept-name-big">{concept.name}</span>
      </div>

      <div className="pt-concept-card">
        <h4 className="pt-concept-section-title">Explanation (private)</h4>
        <p className="pt-concept-explanation">{concept.explanation}</p>

        {concept.keyPoints?.length > 0 && (
          <>
            <h4 className="pt-concept-section-title">Key points to cover:</h4>
            <ul className="pt-key-points">
              {concept.keyPoints.map((kp, i) => <li key={i}>• {kp}</li>)}
            </ul>
          </>
        )}

        {topicMisconceptions.length > 0 && (
          <div className="pt-warning-box">
            <h4>⚠️ Misconception to watch for:</h4>
            {topicMisconceptions.map((m, i) => (
              <p key={i} className="pt-misconception-text">"{m.misconception}"</p>
            ))}
          </div>
        )}
      </div>

      {/* AI feedback on learner's explanation (private to teacher) */}
      {pendingResult && (
        <div className="pt-teacher-review">
          <h4 className="pt-concept-section-title">
            {(session.learner?.name || "Learner")}'s explanation:
          </h4>
          <blockquote className="pt-learner-response">"{pendingResult.response}"</blockquote>

          {pendingResult.aiFeedback && (
            <div className="pt-ai-note">
              <div className="pt-ai-note-header">
                <span>🤖 AI Assessment (private)</span>
                <span className={`pt-verdict-chip ${pendingResult.aiVerdict}`}>{pendingResult.aiVerdict}</span>
              </div>
              <p>{pendingResult.aiFeedback}</p>
              {pendingResult.misconceptionsDetected?.length > 0 && (
                <p className="pt-misc-detected">
                  ⚠️ Misconception: {pendingResult.misconceptionsDetected[0]?.name}
                </p>
              )}
            </div>
          )}

          <h4 className="pt-concept-section-title">Your feedback to {session.learner?.name || "learner"}:</h4>
          <textarea
            className="pt-textarea"
            rows={3}
            placeholder="Write your feedback…"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          {err && <p className="pt-form-err">{err}</p>}
          <div className="pt-verdict-btns">
            <button className="pt-btn-verdict-good"  onClick={() => handleVerdict("approved")} disabled={busy}>
              ✓ Good explanation
            </button>
            <button className="pt-btn-verdict-retry" onClick={() => handleVerdict("retry")}    disabled={busy}>
              ↩ Needs more work
            </button>
          </div>
        </div>
      )}

      {/* Ask learner button (only shown if no pending result yet) */}
      {!pendingResult && (
        <button
          className="pt-btn-ask-learner"
          onClick={handleAsk}
          disabled={teacherTriggered}
        >
          {teacherTriggered ? "✓ Prompt sent to learner" : `Ask ${session.learner?.name || "learner"} to explain this back`}
        </button>
      )}

      {/* Waiting for learner after prompting */}
      {teacherTriggered && !pendingResult && (
        <p className="pt-waiting-learner">
          Waiting for {session.learner?.name || "learner"}'s explanation…
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPTS PHASE — Learner panel
// ─────────────────────────────────────────────────────────────────────────────

function LearnerConceptPanel({ session, concept, onSubmitted }) {
  const allResults = session.results || [];
  // Check if teacher asked for explanation (teacher_triggered flag via polling)
  // We infer from session: if teacherReady=true & phase=concepts, teacher has triggered
  const myResults = allResults.filter(
    r => r.conceptId === concept.id && r.userId === session.learnerId
  ).sort((a, b) => b.attemptNumber - a.attemptNumber);
  const latest       = myResults[0] ?? null;
  const attemptCount = myResults.length;
  const hasTeacherFeedback = latest?.teacherVerdict != null;

  const [response, setResponse] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [prompted, setPrompted] = useState(false);

  // Detect if teacher has asked for explanation by checking if
  // teacherTriggered is set (we use a polling signal — if session phase
  // advanced or teacher concept card is showing "waiting", we simply allow)
  // Simple UX: show the textarea after a button click by learner
  const hint = concept.keyPoints?.[0]
    || (session.topic?.misconceptions || []).find(m => !m.conceptId)?.hint;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!response.trim()) return;
    setBusy(true); setErr("");
    try {
      await api.submitExplanation(session.id, concept.id, {
        response: response.trim(),
        attemptNumber: attemptCount + 1,
      });
      setResponse("");
      onSubmitted();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="pt-left-panel">
      <div className="pt-concept-header">
        <span className="pt-concept-counter">
          Concept {(session.currentConceptIdx ?? 0) + 1} of {(session.topic?.concepts || []).length}
        </span>
        <span className="pt-concept-name-big">{concept.name}</span>
      </div>

      {/* Teacher feedback from last attempt */}
      {hasTeacherFeedback && (
        <div className="pt-feedback-teacher">
          <h4>Feedback from {session.teacher?.name || "teacher"}:</h4>
          <p>{latest.teacherComment || (latest.teacherVerdict === "approved" ? "Great explanation!" : "Keep trying!")}</p>
          {latest.aiFeedback && (
            <div className="pt-feedback-ai">
              <span>🤖 AI adds:</span>
              <p>{latest.aiFeedback}</p>
            </div>
          )}
          {latest.teacherVerdict === "retry" && (
            <button className="pt-btn-ghost pt-btn-sm" onClick={() => setPrompted(true)}>
              Try explaining again
            </button>
          )}
        </div>
      )}

      {/* Waiting or explanation prompt */}
      {!hasTeacherFeedback && !prompted && latest === null && (
        <div className="pt-learner-waiting">
          <div className="pt-spinner-sm" />
          <p>{session.teacher?.name || "Teacher"} is explaining {concept.name}…</p>
          <p className="pt-learner-waiting-sub">Ask questions in the chat if needed.</p>
          <button className="pt-btn-primary pt-btn-sm" onClick={() => setPrompted(true)} style={{ marginTop: 12 }}>
            I'm ready to explain this back
          </button>
        </div>
      )}

      {/* Submitted but awaiting teacher verdict */}
      {!hasTeacherFeedback && latest !== null && (
        <div className="pt-awaiting-verdict">
          <div className="pt-spinner-sm" />
          <p>Your explanation was submitted. Waiting for {session.teacher?.name || "teacher"}'s feedback…</p>
        </div>
      )}

      {/* Explanation form */}
      {(prompted || (latest?.teacherVerdict === "retry")) && !hasTeacherFeedback && latest === null && (
        <div className="pt-explain-area">
          <p className="pt-explain-prompt">Now explain in your own words:</p>
          <p className="pt-explain-question">"{concept.name}" — what is it and how does it work?</p>
          <textarea
            className="pt-textarea"
            rows={5}
            placeholder="Type your explanation here…"
            value={response}
            onChange={e => setResponse(e.target.value)}
          />
          <div className="pt-explain-footer">
            <span className="pt-attempt-count">Attempt {attemptCount + 1} of 3</span>
            {hint && (
              <button className="pt-btn-ghost pt-btn-sm" onClick={() => setShowHint(s => !s)}>
                💡 {showHint ? "Hide hint" : "Need a hint?"}
              </button>
            )}
            <button
              className="pt-btn-primary"
              onClick={handleSubmit}
              disabled={!response.trim() || busy}
            >
              {busy ? "Submitting…" : "Submit →"}
            </button>
          </div>
          {showHint && hint && <div className="pt-hint-box">💡 {hint}</div>}
          {err && <p className="pt-form-err">{err}</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE PHASE
// ─────────────────────────────────────────────────────────────────────────────

function PracticePanel({ session, isTeacher, onComplete }) {
  const [questions, setQuestions] = useState([]);
  const [qIdx,      setQIdx]      = useState(0);
  const [answer,    setAnswer]    = useState("");
  const [reveal,    setReveal]    = useState(null);
  const [busy,      setBusy]      = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.getPracticeQuestions(session.id)
      .then(data => { setQuestions(data.questions || []); })
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [session.id]);

  async function handleSubmit() {
    if (!answer.trim() || !questions[qIdx]) return;
    setBusy(true);
    try {
      const res = await api.submitPracticeAnswer(session.id, questions[qIdx].id, { response: answer });
      if (res.bothAnswered && res.reveal) setReveal(res.reveal);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  }

  function next() {
    setReveal(null); setAnswer("");
    if (qIdx + 1 < questions.length) setQIdx(qIdx + 1);
    else onComplete();
  }

  if (loading) return <div className="pt-left-panel"><div className="pt-spinner-sm" /></div>;

  const q = questions[qIdx];
  if (!q) return (
    <div className="pt-left-panel">
      <p>No practice questions available for this topic yet.</p>
      <button className="pt-btn-primary pt-btn-sm" onClick={onComplete}>Continue →</button>
    </div>
  );

  return (
    <div className="pt-left-panel">
      <div className="pt-phase-header">
        <span className="pt-phase-num">4</span>
        <div>
          <p className="pt-phase-type">Practice</p>
          <h3 className="pt-phase-title">{q.question}</h3>
          <span className="pt-phase-meta">Question {qIdx + 1}/{questions.length} · {q.difficulty}</span>
        </div>
      </div>

      {reveal ? (
        <div className="pt-reveal-row">
          <div className="pt-reveal-item">
            <span className="pt-reveal-label">Your answer</span>
            <span className={`pt-reveal-answer ${reveal.allAnswers.find(a => a.userId == session[isTeacher ? "teacherId" : "learnerId"])?.isCorrect ? "correct" : "wrong"}`}>
              {reveal.allAnswers.find(a => a.userId == session[isTeacher ? "teacherId" : "learnerId"])?.response || "—"}{" "}
              {reveal.allAnswers.find(a => a.userId == session[isTeacher ? "teacherId" : "learnerId"])?.isCorrect ? "✅" : "✗"}
            </span>
          </div>
          <div className="pt-reveal-item">
            <span className="pt-reveal-label">Partner's answer</span>
            <span className={`pt-reveal-answer ${reveal.allAnswers.find(a => a.userId != session[isTeacher ? "teacherId" : "learnerId"])?.isCorrect ? "correct" : "wrong"}`}>
              {reveal.allAnswers.find(a => a.userId != session[isTeacher ? "teacherId" : "learnerId"])?.response || "Waiting…"}
            </span>
          </div>
          <div className="pt-reveal-item">
            <span className="pt-reveal-label">Correct answer</span>
            <span className="pt-reveal-answer correct">{reveal.correctAnswer}</span>
          </div>
          {reveal.explanation && <p className="pt-reveal-explanation">{reveal.explanation}</p>}
          <button className="pt-btn-primary" onClick={next}>
            {qIdx + 1 < questions.length ? "Next Question →" : "Continue to Challenge →"}
          </button>
        </div>
      ) : (
        <div className="pt-question-area">
          {q.questionType === "multiple_choice" && q.options?.length > 0 ? (
            <div className="pt-options">
              {q.options.map(opt => (
                <button
                  key={opt.label}
                  className={`pt-option-card ${answer === opt.label ? "selected" : ""}`}
                  onClick={() => setAnswer(opt.label)}
                >
                  <span className="pt-option-label">{opt.label}.</span>
                  <span>{opt.text}</span>
                </button>
              ))}
            </div>
          ) : q.questionType === "numeric" ? (
            <input className="pt-input" type="number" placeholder="Your answer…" value={answer} onChange={e => setAnswer(e.target.value)} />
          ) : (
            <input className="pt-input" placeholder="Your answer…" value={answer} onChange={e => setAnswer(e.target.value)} />
          )}
          <div className="pt-question-footer">
            <span className="pt-partner-wait">Partner: Waiting for their answer…</span>
            <button className="pt-btn-primary" onClick={handleSubmit} disabled={!answer.trim() || busy}>
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE PHASE
// ─────────────────────────────────────────────────────────────────────────────

function ChallengePanel({ session, isTeacher, onComplete }) {
  const [response, setResponse] = useState("");
  const [result,   setResult]   = useState(null);
  const [comment,  setComment]  = useState("");
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState("");

  async function handleSubmit() {
    if (!response.trim()) return;
    setBusy(true); setErr("");
    try {
      const res = await api.submitChallenge(session.id, { response: response.trim() });
      setResult(res);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function handleVerdict(verdict) {
    // For challenge, the verdict endpoint is the same concept endpoint
    // We use concept 0 as a stand-in (no concept_id)
    try {
      await api.submitTeacherVerdict(session.id, 0, {
        verdict, teacherComment: comment.trim(),
      });
      onComplete();
    } catch { onComplete(); }
  }

  const topic = session.topic || {};
  const challengeActivity = (topic.activities || []).find(a => a.type === "challenge");

  if (!isTeacher && !result) return (
    <div className="pt-left-panel">
      <div className="pt-phase-header">
        <span className="pt-phase-num">5</span>
        <div>
          <p className="pt-phase-type">🔄 Role Reversal!</p>
          <h3 className="pt-phase-title">Now YOU are the teacher.</h3>
        </div>
      </div>
      <p className="pt-explain-prompt">Explain to {session.teacher?.name || "your partner"}:</p>
      <p className="pt-explain-question">
        "{challengeActivity?.prompt || `Why does ${topic.name} work the way it does?`}"
      </p>
      <textarea
        className="pt-textarea"
        rows={6}
        placeholder="Explain as if you're teaching it…"
        value={response}
        onChange={e => setResponse(e.target.value)}
      />
      {err && <p className="pt-form-err">{err}</p>}
      <button className="pt-btn-primary" onClick={handleSubmit} disabled={!response.trim() || busy}>
        {busy ? "Submitting…" : "Submit Challenge Explanation"}
      </button>
    </div>
  );

  if (!isTeacher && result) return (
    <div className="pt-left-panel">
      <div className="pt-phase-header">
        <span className="pt-phase-num">5</span>
        <div><p className="pt-phase-type">Challenge</p><h3>Submitted! Waiting for teacher feedback…</h3></div>
      </div>
      <div className="pt-spinner-sm" />
    </div>
  );

  // Teacher seeing learner's challenge
  const allResults = session.results || [];
  const challengeResult = allResults.find(r => r.userId === session.learnerId && !r.conceptId && r.response);

  if (!challengeResult) return (
    <div className="pt-left-panel">
      <div className="pt-phase-header">
        <span className="pt-phase-num">5</span>
        <div><p className="pt-phase-type">Challenge</p><h3>Waiting for {session.learner?.name || "learner"} to submit their challenge explanation…</h3></div>
      </div>
      <div className="pt-spinner-sm" />
    </div>
  );

  return (
    <div className="pt-left-panel">
      <div className="pt-phase-header">
        <span className="pt-phase-num">5</span>
        <div><p className="pt-phase-type">Challenge Review</p><h3>{session.learner?.name}'s explanation:</h3></div>
      </div>
      <blockquote className="pt-learner-response">"{challengeResult.response}"</blockquote>
      {challengeResult.aiFeedback && (
        <div className="pt-ai-note">
          <div className="pt-ai-note-header">
            <span>🤖 AI Assessment</span>
            <span className={`pt-verdict-chip ${challengeResult.aiVerdict}`}>{challengeResult.aiVerdict}</span>
          </div>
          <p>{challengeResult.aiFeedback}</p>
        </div>
      )}
      <textarea className="pt-textarea" rows={3} placeholder="Your feedback…" value={comment} onChange={e => setComment(e.target.value)} />
      <div className="pt-verdict-btns">
        <button className="pt-btn-verdict-good"  onClick={() => handleVerdict("approved")}>✓ Strong teacher!</button>
        <button className="pt-btn-verdict-retry" onClick={() => handleVerdict("retry")}>↩ Needs revision</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar at bottom
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ session }) {
  const concepts = (session.topic?.concepts || []).sort((a, b) => a.id - b.id);
  const results  = session.results || [];
  const phase    = session.phase;

  function conceptStatus(c, idx) {
    if (phase === "practice" || phase === "challenge" || phase === "summary") return "done";
    if (idx < (session.currentConceptIdx ?? 0)) return "done";
    if (idx === (session.currentConceptIdx ?? 0)) return "active";
    return "pending";
  }

  return (
    <div className="pt-progress-bar">
      {concepts.map((c, i) => (
        <div key={c.id} className={`pt-prog-dot ${conceptStatus(c, i)}`} title={c.name}>
          {conceptStatus(c, i) === "done" ? "✓" : c.name.charAt(0)}
        </div>
      ))}
      {concepts.length > 0 && <div className="pt-prog-sep" />}
      <div className={`pt-prog-dot ${phase === "practice" || phase === "challenge" || phase === "summary" ? "done" : "pending"}`} title="Practice">P</div>
      <div className={`pt-prog-dot ${phase === "challenge" || phase === "summary" ? "done" : "pending"}`} title="Challenge">C</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROOM
// ─────────────────────────────────────────────────────────────────────────────

export default function SessionRoomPage() {
  const { sessionId } = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const [session,  setSession]  = useState(null);
  const [error,    setError]    = useState("");
  const [elapsed,  setElapsed]  = useState(0);
  const [endBusy,  setEndBusy]  = useState(false);
  const intervalRef = useRef(null);
  const timerRef    = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getLearningSession(Number(sessionId));
      setSession(data);
      if (data.status === "completed") {
        clearInterval(intervalRef.current);
        navigate(`/app/rooms/summary/${sessionId}`);
      }
    } catch (e) { setError(e.message); }
  }, [sessionId, navigate]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 3000);
    timerRef.current    = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(intervalRef.current); clearInterval(timerRef.current); };
  }, [load]);

  async function handleEnd() {
    setEndBusy(true);
    try {
      await api.completeSession(Number(sessionId));
      navigate(`/app/rooms/summary/${sessionId}`);
    } catch { navigate(`/app/rooms/summary/${sessionId}`); }
    finally { setEndBusy(false); }
  }

  if (error) return <div className="pt-page pt-page-centered"><div className="pt-error-card"><p>{error}</p></div></div>;
  if (!session) return <div className="pt-page pt-page-centered"><div className="pt-spinner" /></div>;

  const myId     = Number(user?.uid);
  const isTeacher = myId === session.teacherId;
  const partner  = isTeacher ? session.learner : session.teacher;
  const topic    = session.topic || {};
  const phase    = session.phase || "concepts";
  const concepts = (topic.concepts || []).sort((a, b) => a.id - b.id);
  const currentConcept = concepts[session.currentConceptIdx ?? 0];

  // Find convId from accepted partners if available
  // For now we look for convId via the partner user
  // The chat panel will work if we have it
  const convId = null; // TODO: pass convId from session creation if chat integration needed

  return (
    <div className="pt-room-shell">
      {/* Top header */}
      <header className="pt-room-header">
        <div className="pt-room-topic">
          <span className="pt-room-topic-icon">{topic.subjectIcon || "📚"}</span>
          <div>
            <span className="pt-room-topic-name">{topic.name}</span>
            <span className="pt-room-topic-sub">{topic.subject} · {fmtTime(elapsed)}</span>
          </div>
        </div>
        <div className="pt-room-phase-indicator">
          {phase === "concepts"  && <span className="pt-phase-badge concepts">Concepts Phase</span>}
          {phase === "practice"  && <span className="pt-phase-badge practice">Practice Phase</span>}
          {phase === "challenge" && <span className="pt-phase-badge challenge">Challenge Phase</span>}
          {phase === "summary"   && <span className="pt-phase-badge summary">Complete!</span>}
        </div>
        <div className="pt-room-header-right">
          <span className="pt-room-partner">
            <Avatar url={partner?.photoUrl} name={partner?.name} size={26} />
            {partner?.name || "Partner"}
          </span>
          <button className="pt-end-btn" onClick={handleEnd} disabled={endBusy}>
            {endBusy ? "Ending…" : "End Session"}
          </button>
        </div>
      </header>

      {/* Main body: left panel + chat */}
      <div className="pt-room-body">
        {/* Left panel — role-specific */}
        {phase === "concepts" && currentConcept && (
          isTeacher
            ? <TeacherConceptPanel
                session={session}
                concept={currentConcept}
                concepts={concepts}
                onAskLearner={() => {}}
                onVerdictSent={load}
              />
            : <LearnerConceptPanel
                session={session}
                concept={currentConcept}
                onSubmitted={load}
              />
        )}

        {phase === "practice" && (
          <PracticePanel
            session={session}
            isTeacher={isTeacher}
            onComplete={async () => {
              // Advance to challenge
              const updated = await api.getLearningSession(Number(sessionId));
              setSession(updated);
            }}
          />
        )}

        {phase === "challenge" && (
          <ChallengePanel
            session={session}
            isTeacher={isTeacher}
            onComplete={handleEnd}
          />
        )}

        {/* Chat panel */}
        <ChatPanel
          convId={convId}
          partnerName={partner?.name}
          partnerPhoto={partner?.photoUrl}
        />
      </div>

      {/* Bottom progress */}
      <ProgressBar session={session} />
    </div>
  );
}
