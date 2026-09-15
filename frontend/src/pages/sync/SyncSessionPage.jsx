/**
 * SyncSessionPage — /app/sync/session/:sessionId
 * The 4-phase sync session: Warmup → Explain → Quiz → Gap Check
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import "../solo/solo.css";

const PHASE_ORDER  = ["WARMUP", "EXPLAIN", "QUIZ", "GAP_CHECK"];
const PHASE_LABELS = { WARMUP: "Warm-up", EXPLAIN: "Explain", QUIZ: "Quiz", GAP_CHECK: "Gap Check" };
const PHASE_TIMES  = { WARMUP: "0–2 min", EXPLAIN: "2–7 min", QUIZ: "7–12 min", GAP_CHECK: "12–15 min" };

function PeerAvatar({ name, photo, size = 40 }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div className="peer-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photo ? <img src={photo} alt={name} referrerPolicy="no-referrer" /> : initial}
    </div>
  );
}

function SessionTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const secs = (elapsed % 60).toString().padStart(2, "0");
  const total = elapsed / 60;
  const cls = total >= 13 ? "danger" : total >= 10 ? "warning" : "";
  return <div className={`sync-timer ${cls}`}>{mins}:{secs}</div>;
}

function PhaseBar({ currentPhase }) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {PHASE_ORDER.map((ph, i) => (
        <div key={ph} style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            height: 4, borderRadius: 99,
            background: i < idx ? "#22c55e" : i === idx ? "#4f6ef7" : "#1e293b",
            marginBottom: 4,
          }} />
          <div style={{ fontSize: 10, color: i <= idx ? "#e2e8f0" : "#334155", fontWeight: i === idx ? 700 : 400 }}>
            {PHASE_LABELS[ph]}
          </div>
          <div style={{ fontSize: 9, color: "#334155" }}>{PHASE_TIMES[ph]}</div>
        </div>
      ))}
    </div>
  );
}

// ── Phase 1: Warmup ────────────────────────────────────────────────────────

function WarmupPhase({ session, myRole, onPhaseChange }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [submitting, setSubmitting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [partnerDone, setPartnerDone] = useState(false);

  useEffect(() => {
    api.syncGetWarmup(session.id)
      .then(d => { setQuestions(d.questions); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.id]);

  const myDone = questions.length > 0 && questions.every(q => q.answered || !!results[q.id]);

  async function handleSubmit(qId) {
    if (!answers[qId]) return;
    setSubmitting(qId);
    try {
      const res = await api.syncSubmitWarmupAnswer(session.id, {
        question_id: qId,
        response: answers[qId],
      });
      setResults(prev => ({ ...prev, [qId]: { isCorrect: res.isCorrect, correctAnswer: res.correctAnswer, explanation: res.explanation } }));
      setPartnerDone(res.partnerDone);
      if (res.phaseAdvanced) {
        onPhaseChange("EXPLAIN");
      } else {
        // Reload to reflect answered state
        api.syncGetWarmup(session.id).then(d => setQuestions(d.questions)).catch(() => {});
      }
    } catch { } finally { setSubmitting(null); }
  }

  if (loading) return <div className="solo-loading"><div className="solo-spinner" />Loading warmup…</div>;

  return (
    <div>
      <div className="ai-badge" style={{ marginBottom: 12 }}>
        <div className="ai-badge-dot" />
        Warm-up (1/2)
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 10 }}>2–3 min remaining</span>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
        What is the relationship between force, mass and acceleration?
      </h3>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Answer the warmup questions to confirm your checkpoint.</p>

      {questions.map((q, i) => {
        const res = results[q.id] || (q.answered ? { isCorrect: q.isCorrect, answered: true } : null);
        const done = !!res;
        return (
          <div key={q.id} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Question {i + 1}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 14 }}>{q.question}</div>

            {q.questionType === "multiple_choice" && q.options ? (
              <div className="checkpoint-options">
                {q.options.map(opt => {
                  const val = opt.text;
                  const sel = answers[q.id] === val || q.userAnswer === val;
                  let cls = sel ? "selected" : "";
                  if (done) {
                    cls += " disabled";
                    if (val === res.correctAnswer) cls += " correct";
                    else if (sel && !res.isCorrect) cls += " wrong";
                  }
                  return (
                    <button key={opt.label} className={`checkpoint-option ${cls}`}
                      onClick={() => !done && setAnswers(p => ({ ...p, [q.id]: val }))}
                      disabled={done}>
                      <span className="checkpoint-option-label">{opt.label}</span>{val}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                style={{ width: "100%", background: "#081325", border: "1.5px solid #1e293b", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#e2e8f0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                placeholder="Your answer…"
                value={answers[q.id] || q.userAnswer || ""}
                onChange={e => !done && setAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                disabled={done}
              />
            )}

            {done && (
              <div style={{ marginTop: 8, fontSize: 13, color: res.isCorrect ? "#22c55e" : "#ef4444" }}>
                {res.isCorrect ? "✓ Correct" : `✗ Correct answer: ${res.correctAnswer || ""}`}
                {res.explanation && <div style={{ color: "#64748b", marginTop: 4 }}>{res.explanation}</div>}
              </div>
            )}

            {!done && (
              <button className="btn-primary" style={{ marginTop: 12 }}
                onClick={() => handleSubmit(q.id)}
                disabled={!answers[q.id] || submitting === q.id}>
                {submitting === q.id ? "Checking…" : "Submit Answer"}
              </button>
            )}
          </div>
        );
      })}

      {myDone && (
        <div style={{ padding: "12px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, fontSize: 13, color: "#22c55e", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="solo-spinner" style={{ borderTopColor: "#22c55e", width: 14, height: 14 }} />
          {partnerDone ? "Both done — moving to Explain phase…" : "Waiting for your partner to finish…"}
        </div>
      )}

      {questions.length === 0 && (
        <button className="btn-primary" onClick={() => onPhaseChange("EXPLAIN")}>
          Skip Warmup →
        </button>
      )}
    </div>
  );
}

// ── Phase 2: Explain ───────────────────────────────────────────────────────

function ExplainPhase({ session, myRole, onPhaseChange }) {
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [partnerExplanation, setPartnerExplanation] = useState(null);
  const [reacted, setReacted] = useState(false);
  const [reacting, setReacting] = useState(false);

  const myTurn = session.explainTurn === myRole;
  const myExplained = myRole === "initiator" ? session.initiatorExplained : session.partnerExplained;
  const partnerExplained = myRole === "initiator" ? session.partnerExplained : session.initiatorExplained;

  async function handleSubmitExplanation() {
    if (!explanation.trim()) return;
    setSubmitting(true);
    try {
      await api.syncSubmitExplanation(session.id, { explanation: explanation.trim() });
      setSubmitted(true);
    } catch { } finally { setSubmitting(false); }
  }

  async function handleReact(understood) {
    setReacting(true);
    try {
      await api.syncReactToExplanation(session.id, { understood });
      setReacted(true);
    } catch { } finally { setReacting(false); }
  }

  const turnLabel = myTurn ? "Your turn" : "Partner's turn";
  const showBothDone = myExplained && partnerExplained;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div className="ai-badge">
          <div className="ai-badge-dot" />
          Explain ({myRole === "initiator" ? "1" : "2"}/2)
          <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 10 }}>3–5 min remaining</span>
        </div>
        <div style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 8, background: myTurn ? "rgba(79,110,247,0.15)" : "rgba(100,116,139,0.1)", color: myTurn ? "#4f6ef7" : "#64748b", fontSize: 12, fontWeight: 600 }}>
          {turnLabel}
        </div>
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>
        {myTurn ? "Your turn" : "Partner is explaining"}
      </h3>

      {myTurn && !submitted && (
        <>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
            Explain {session.concept?.name} in your own words to your partner.
          </p>
          <textarea
            className="solo-textarea"
            placeholder="Type your explanation here…"
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            rows={5}
          />
          <div className="solo-char-count">{explanation.length}/500</div>
          <button className="btn-primary" style={{ marginTop: 12 }}
            onClick={handleSubmitExplanation}
            disabled={explanation.trim().length < 10 || submitting}>
            {submitting ? "Sending…" : "Send →"}
          </button>
        </>
      )}

      {myTurn && submitted && (
        <div style={{ padding: "14px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, fontSize: 13, color: "#22c55e", marginBottom: 14 }}>
          ✓ Explanation sent. Waiting for partner's reaction…
        </div>
      )}

      {!myTurn && partnerExplanation && !reacted && (
        <>
          <div style={{ background: "#081325", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
            {partnerExplanation}
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>Partner's Feedback</div>
          <div className="btn-row">
            <button className="btn-success"
              onClick={() => handleReact(true)} disabled={reacting}>
              ✓ I understood that
            </button>
            <button style={{ padding: "12px 24px", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => handleReact(false)} disabled={reacting}>
              I'm still confused
            </button>
          </div>
        </>
      )}

      {!myTurn && !partnerExplanation && (
        <div style={{ padding: "14px 16px", background: "#081325", border: "1px solid #1e293b", borderRadius: 10, fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 10 }}>
          <div className="solo-spinner" />
          Waiting for partner to explain…
        </div>
      )}

      {showBothDone && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, fontSize: 13, color: "#22c55e" }}>
          ✓ Both explained. Moving to Quiz phase…
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "#334155", fontStyle: "italic" }}>
        Be clear and simple. Focus on the key ideas.
      </div>
    </div>
  );
}

// ── Phase 3: Quiz ──────────────────────────────────────────────────────────

function QuizPhase({ session, myRole }) {
  const [suggestions, setSuggestions] = useState([]);
  const [customQ, setCustomQ] = useState("");
  const [exchanges, setExchanges] = useState([]);
  const [myAnswer, setMyAnswer] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.syncGetQuizSuggestions(session.id).then(setSuggestions).catch(() => {});
  }, [session.id]);

  async function handleAskQuestion(text) {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const ex = await api.syncAskQuestion(session.id, { question_text: text });
      setExchanges(prev => [...prev, ex]);
      setCustomQ("");
    } catch { } finally { setSubmitting(false); }
  }

  async function handleAnswer(exchId) {
    const ans = myAnswer[exchId];
    if (!ans?.trim()) return;
    try {
      const updated = await api.syncAnswerQuestion(session.id, exchId, { answer_text: ans });
      setExchanges(prev => prev.map(e => e.id === exchId ? updated : e));
    } catch { }
  }

  const myExchanges = exchanges.filter(e => e.askerId === (myRole === "initiator" ? session.initiatorId : session.partnerId));
  const theirExchanges = exchanges.filter(e => e.answererId === (myRole === "initiator" ? session.initiatorId : session.partnerId));

  return (
    <div>
      <div className="ai-badge" style={{ marginBottom: 12 }}>
        <div className="ai-badge-dot" />
        Quiz (2/5)
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 10 }}>5 min remaining</span>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 16 }}>
        Ask your partner a question or choose from the suggestions.
      </h3>

      {/* My question to partner */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Suggested Questions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {suggestions.slice(0, 4).map(s => (
            <button key={s.id} className="suggested-q-btn"
              onClick={() => handleAskQuestion(s.text)}>
              <span style={{ color: "#4f6ef7" }}>?</span> {s.text}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>My Question</div>
        <div className="ask-ai-input-row">
          <input
            className="ask-ai-input"
            placeholder="Type your own question…"
            value={customQ}
            onChange={e => setCustomQ(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAskQuestion(customQ)}
          />
          <button className="btn-primary" style={{ padding: "12px 16px" }}
            onClick={() => handleAskQuestion(customQ)}
            disabled={!customQ.trim() || submitting}>
            Ask
          </button>
        </div>
      </div>

      {/* Exchanges */}
      {exchanges.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Exchanges</div>
          {exchanges.map(ex => (
            <div key={ex.id} style={{ background: "#081325", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>
                Q: {ex.questionText}
              </div>
              {ex.answerText ? (
                <div style={{ fontSize: 14, color: "#e2e8f0" }}>
                  A: {ex.answerText}
                  {ex.isCorrect !== null && ex.isCorrect !== undefined && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: ex.isCorrect ? "#22c55e" : "#ef4444" }}>
                      {ex.isCorrect ? "✓" : "✗"}
                    </span>
                  )}
                </div>
              ) : ex.answererId !== undefined && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    className="ask-ai-input"
                    placeholder="Type answer…"
                    value={myAnswer[ex.id] || ""}
                    onChange={e => setMyAnswer(p => ({ ...p, [ex.id]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button className="connect-btn" onClick={() => handleAnswer(ex.id)}>Answer</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main session page ───────────────────────────────────────────────────────

export default function SyncSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef(null);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [advancingPhase, setAdvancingPhase] = useState(false);

  const loadSession = useCallback(() => {
    return api.syncGetSession(sessionId).then(setSession).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    loadSession().finally(() => setLoading(false));
  }, [loadSession]);

  useEffect(() => {
    const ws = api.openSyncSocket(sessionId, msg => {
      if (["session_updated", "phase_changed", "warmup_answered", "explanation_submitted", "explanation_reaction"].includes(msg.type)) {
        loadSession();
      }
      if (msg.type === "session_completed") {
        navigate(`/app/sync/complete/${sessionId}`, { replace: true });
      }
      if (msg.type === "chat") {
        setChatMessages(prev => [...prev, msg.data]);
      }
    }, () => {});
    wsRef.current = ws;
    return () => ws.close();
  }, [sessionId, loadSession]);

  // Redirect on phase change to complete pages
  useEffect(() => {
    if (session?.phase === "COMPLETED") {
      navigate(`/app/sync/complete/${sessionId}`, { replace: true });
    }
    if (session?.phase === "LOBBY") {
      navigate(`/app/sync/lobby/${sessionId}`, { replace: true });
    }
  }, [session?.phase]);

  function sendChat() {
    if (!chatInput.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", text: chatInput }));
    setChatMessages(prev => [...prev, { userId: "me", text: chatInput }]);
    setChatInput("");
  }

  async function handleAdvanceToGapCheck() {
    setAdvancingPhase(true);
    try {
      await api.syncRunGapCheck(sessionId);
      navigate(`/app/sync/gap/${sessionId}`);
    } catch { } finally { setAdvancingPhase(false); }
  }

  if (loading || !session) return (
    <div className="solo-shell">
      <div className="solo-loading"><div className="solo-spinner" />Loading session…</div>
    </div>
  );

  const myRole = session.myRole;
  const partner = myRole === "initiator" ? session.partner : session.initiator;
  const phase = session.phase;

  return (
    <div className="solo-shell">
      {/* Top bar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>
            {session.concept?.name} — Sync
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            with {partner?.displayName || "Partner"} · {session.subjectName}
          </div>
        </div>
        <SessionTimer startedAt={session.startedAt} />
      </div>

      {/* Phase bar */}
      <div style={{ padding: "12px 24px" }}>
        <PhaseBar currentPhase={phase} />
      </div>

      <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        {/* Left — current phase */}
        <div className="solo-card">
          {phase === "WARMUP" && (
            <WarmupPhase
              session={session}
              myRole={myRole}
              onPhaseChange={() => loadSession()}
            />
          )}
          {phase === "EXPLAIN" && (
            <ExplainPhase
              session={session}
              myRole={myRole}
              onPhaseChange={() => loadSession()}
            />
          )}
          {phase === "QUIZ" && (
            <QuizPhase session={session} myRole={myRole} />
          )}
          {phase === "GAP_CHECK" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 16, color: "#e2e8f0", fontWeight: 600, marginBottom: 8 }}>
                Gap Check in progress…
              </div>
              <button className="btn-primary" onClick={() => navigate(`/app/sync/gap/${sessionId}`)}>
                View Gap Check →
              </button>
            </div>
          )}

          {/* Advance to gap check button for quiz phase */}
          {phase === "QUIZ" && (
            <div className="btn-row" style={{ marginTop: 24, borderTop: "1px solid #1e293b", paddingTop: 16 }}>
              <button className="btn-primary" onClick={handleAdvanceToGapCheck} disabled={advancingPhase}>
                {advancingPhase ? "Running gap check…" : "Proceed to Gap Check →"}
              </button>
            </div>
          )}
        </div>

        {/* Right — chat + partner status */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Partner status */}
          <div className="solo-card-sm">
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Partner's Status</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="peer-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                {partner?.photoURL
                  ? <img src={partner.photoURL} alt={partner.displayName} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (partner?.displayName || "P")[0]}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{partner?.displayName || "Partner"}</div>
                <div style={{ fontSize: 11, color: "#22c55e" }}>● Online</div>
              </div>
            </div>
          </div>

          {/* Session Chat */}
          <div className="solo-card-sm" style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Session Chat</div>
            <div className="sync-chat-area">
              {chatMessages.length === 0 && (
                <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "20px 0" }}>
                  No messages yet
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`sync-chat-msg ${m.userId === "me" ? "mine" : ""}`}>
                  <div className="sync-chat-bubble">{m.text}</div>
                </div>
              ))}
            </div>
            <div className="sync-chat-input-row">
              <input
                className="sync-chat-input"
                placeholder="Type a message…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
              />
              <button className="sync-chat-send" onClick={sendChat}>↑</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
