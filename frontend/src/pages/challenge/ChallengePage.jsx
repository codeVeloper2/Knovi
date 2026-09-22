import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { ChallengeIcon, CloseIcon, ChevronRight } from "../../components/DashIcons";
import "../../styles/challenge.css";

const ACTIVE_STATUSES = new Set([
  "pending", "accepted", "preparing", "waiting", "countdown",
  "question_active", "waiting_for_opponent", "question_reveal", "next_question",
]);

function Avatar({ url, name, size = 44, online = false }) {
  const initial = (name || "P").trim().charAt(0).toUpperCase();
  return (
    <span className="challenge-avatar-wrap" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" className="challenge-avatar" /> : <span className="challenge-avatar challenge-avatar--initial">{initial}</span>}
      {online && <span className="challenge-avatar-online" />}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function fmtStatus(status) {
  return String(status || "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function useServerClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function secondsUntil(iso, now) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

function InitialLoader({ label = "Loading Challenge…" }) {
  return <div className="challenge-loading"><span className="challenge-spinner" /><span>{label}</span></div>;
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="challenge-empty challenge-error-state">
      <div className="challenge-empty-icon challenge-empty-icon--error">!</div>
      <h2>Connection issue</h2>
      <p>{message || "We couldn't load this challenge right now."}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Try again</button>
    </div>
  );
}

function ChallengeHeader({ onBack, title = "Challenge", subtitle = "Test your knowledge. Learn together. Grow faster." }) {
  return (
    <div className="challenge-page-header">
      <div className="challenge-heading-copy">
        {onBack && <button type="button" className="challenge-back" onClick={onBack} aria-label="Back"><ChevronRight style={{ transform: "rotate(180deg)" }} /></button>}
        <div className="challenge-title-icon"><ChallengeIcon width={22} height={22} /></div>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
      </div>
    </div>
  );
}

function SectionTitle({ title, action, onAction }) {
  return <div className="challenge-section-title"><h2>{title}</h2>{action && <button type="button" className="challenge-text-button" onClick={onAction}>{action}</button>}</div>;
}

function PeerRow({ peer, selected, onSelect }) {
  return (
    <button type="button" className={`challenge-peer-row${selected ? " selected" : ""}`} onClick={() => onSelect(peer)}>
      <Avatar url={peer.photoURL} name={peer.displayName} size={42} online={peer.isOnline} />
      <span className="challenge-peer-copy"><strong>{peer.displayName}</strong><small>{peer.isOnline ? "Online" : "Offline"}</small></span>
      <span className={`challenge-radio${selected ? " checked" : ""}`}>{selected ? "✓" : ""}</span>
    </button>
  );
}

function StartChallengeDialog({ peers, sessions, onClose, onCreated }) {
  const toast = useToast();
  const [peer, setPeer] = useState(null);
  const [session, setSession] = useState(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const eligibleSessions = sessions.filter(s => !["abandoned", "created"].includes(s.status) && s.conceptId);
  const filteredPeers = peers.filter(p => (p.displayName || "").toLowerCase().includes(query.trim().toLowerCase()));

  async function submit() {
    if (!peer || !session) return;
    setSaving(true);
    try {
      const result = await api.createChallenge({ opponentId: peer.uid ?? peer.id, subjectId: session.subjectId, topicId: session.topicId, conceptId: session.conceptId, questionCount });
      toast.success("Challenge sent.");
      onCreated(result.challenge || result);
    } catch (err) {
      toast.error(err.message || "Couldn't send this challenge.");
    } finally { setSaving(false); }
  }

  return (
    <div className="c-overlay" onMouseDown={onClose}>
      <div className="c-modal c-modal--wide challenge-start-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="challenge-modal-head"><div className="challenge-title-icon"><ChallengeIcon width={20} height={20} /></div><div><h2>Start a Challenge</h2><p>Choose a connected peer and something you have actually learned.</p></div><button type="button" className="challenge-icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        <div className="challenge-start-grid">
          <div><label className="challenge-field-label">Peer</label><input className="challenge-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search connected peers…" /><div className="challenge-peer-list">{filteredPeers.length ? filteredPeers.map(p => <PeerRow key={p.uid ?? p.id} peer={p} selected={(peer?.uid ?? peer?.id) === (p.uid ?? p.id)} onSelect={setPeer} />) : <div className="challenge-inline-empty">No connected peers found.</div>}</div></div>
          <div><label className="challenge-field-label">Your learned concept</label><div className="challenge-session-list">{eligibleSessions.length ? eligibleSessions.map(s => <button key={s.id} type="button" className={`challenge-session-row${session?.id === s.id ? " selected" : ""}`} onClick={() => setSession(s)}><span className="challenge-session-check">{session?.id === s.id ? "✓" : ""}</span><span><strong>{s.conceptName || "Learned concept"}</strong><small>{[s.subjectName, s.topicName].filter(Boolean).join(" · ")}</small></span>{s.overallScore != null && <em>{s.overallScore}%</em>}</button>) : <div className="challenge-inline-empty">Complete an AI learning session first. Your learned concepts will appear here.</div>}</div><label className="challenge-field-label challenge-field-label--spaced">Questions</label><div className="challenge-counts">{[3, 5, 7, 10].map(count => <button key={count} type="button" className={questionCount === count ? "selected" : ""} onClick={() => setQuestionCount(count)}>{count}</button>)}</div></div>
        </div>
        <div className="challenge-modal-note">The server verifies the shared learning overlap before creating the battle. No private learner evidence is shown to your opponent.</div>
        <div className="c-modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn btn-primary" onClick={submit} disabled={!peer || !session || saving}>{saving ? "Sending…" : "Send Challenge"}</button></div>
      </div>
    </div>
  );
}

function HomeView({ challenges, onStart, onOpen, onRefresh }) {
  const incoming = challenges.filter(c => c.status === "pending" && c.role === "opponent");
  const active = challenges.filter(c => ACTIVE_STATUSES.has(c.status));
  const history = challenges.filter(c => ["completed", "expired", "declined", "cancelled"].includes(c.status));
  return (
    <div className="challenge-page">
      <ChallengeHeader />
      <section className="challenge-hero card"><div className="challenge-hero-art"><ChallengeIcon width={34} height={34} /></div><div className="challenge-hero-copy"><span className="challenge-eyebrow">AI Quiz Battle</span><h2>Challenge a peer on something you've both been learning.</h2><p>PeerUP builds the battle from real AI learning evidence and shared curriculum objectives.</p><button type="button" className="btn btn-primary challenge-start-button" onClick={onStart}><ChallengeIcon width={18} height={18} /> Start Challenge</button></div></section>
      {incoming.length > 0 && <section><SectionTitle title="Incoming Challenges" /><div className="challenge-list-grid">{incoming.map(ch => <ChallengeHistoryCard key={ch.id} challenge={ch} incoming onOpen={onOpen} />)}</div></section>}
      <section><SectionTitle title="Active Challenge" action="Refresh" onAction={onRefresh} />{active.length ? <div className="challenge-list-grid">{active.map(ch => <ChallengeHistoryCard key={ch.id} challenge={ch} onOpen={onOpen} />)}</div> : <div className="challenge-empty card"><div className="challenge-empty-icon"><ChallengeIcon width={28} height={28} /></div><h3>No active challenge</h3><p>Challenge a connected peer after you've both learned the same concept.</p></div>}</section>
      <section><SectionTitle title="Challenge History" />{history.length ? <div className="challenge-history-list">{history.map(ch => <ChallengeHistoryCard key={ch.id} challenge={ch} onOpen={onOpen} />)}</div> : <div className="challenge-empty card"><div className="challenge-empty-icon">◷</div><h3>No completed challenges yet</h3><p>Your completed battles will appear here. Nothing is invented while you wait.</p></div>}</section>
    </div>
  );
}

function ChallengeHistoryCard({ challenge, incoming = false, onOpen }) {
  return <button type="button" className="challenge-history-card" onClick={() => onOpen(challenge.id)}><div className="challenge-card-top"><Avatar url={challenge.opponent?.photoURL} name={challenge.opponent?.displayName} size={44} online={challenge.opponent?.isOnline} /><span className={`challenge-status challenge-status--${challenge.status}`}>{incoming ? "Incoming" : fmtStatus(challenge.status)}</span></div><strong>{challenge.opponent?.displayName || "PeerUP student"}</strong><span className="challenge-card-concept">{challenge.conceptName}</span><span className="challenge-card-meta">{challenge.subjectName}{challenge.currentQuestion ? ` · Question ${challenge.currentQuestion}/${challenge.questionCount}` : ` · ${challenge.questionCount} questions`}</span><span className="challenge-card-date">{fmtDate(challenge.completedAt || challenge.createdAt)}</span><ChevronRight className="challenge-card-arrow" /></button>;
}

function WaitingRoom({ challenge, busy, onPrepare, onReady, onRefresh, onBack }) {
  const ready = challenge.ready;
  const preparing = challenge.status === "preparing";
  return <div className="challenge-page challenge-detail-page"><ChallengeHeader onBack={onBack} title="Challenge Room" subtitle="Waiting for both players to be ready…" /><div className="challenge-room card"><div className="challenge-versus"><div className="challenge-player"><Avatar size={68} name="You" /><strong>You</strong><span className={ready ? "ready" : "not-ready"}>{ready ? "Ready" : "Not ready"}</span></div><div className="challenge-vs">VS</div><div className="challenge-player"><Avatar size={68} name={challenge.opponent?.displayName} url={challenge.opponent?.photoURL} online={challenge.opponent?.isOnline} /><strong>{challenge.opponent?.displayName}</strong><span className={challenge.opponentReady ? "ready" : "not-ready"}>{challenge.opponentReady ? "Ready" : "Getting ready"}</span></div></div><div className="challenge-room-summary"><span>{challenge.subjectName}</span><span>·</span><span>{challenge.topicName}</span><span>·</span><span>{challenge.conceptName}</span><span>·</span><span>{challenge.questionCount} questions</span></div><div className="challenge-progress-steps"><span className="done">Challenge accepted</span><span className={preparing ? "current" : challenge.status === "waiting" ? "done" : ""}>Prepare questions</span><span className={challenge.status === "waiting" && !ready ? "current" : ""}>Ready up</span><span>Countdown</span></div><p className="challenge-waiting-reason">{challenge.waitingReason}</p><div className="challenge-room-actions">{challenge.status === "accepted" && <button type="button" className="btn btn-primary" onClick={onPrepare} disabled={busy}>{busy ? "Preparing…" : "Prepare Battle"}</button>}{challenge.status === "preparing" && <div className="challenge-preparing"><span className="challenge-spinner" /> AI questions are being prepared from the shared learning context.</div>}{challenge.status === "waiting" && <button type="button" className="btn btn-primary" onClick={onReady} disabled={busy || ready}>{ready ? "You're ready" : busy ? "Saving…" : "I'm Ready"}</button>}<button type="button" className="btn btn-ghost" onClick={onRefresh}>Refresh</button></div></div></div>;
}

function CountdownView({ challenge, now }) {
  const seconds = secondsUntil(challenge.countdownStartedAt ? new Date(new Date(challenge.countdownStartedAt).getTime() + 3000).toISOString() : null, now);
  return <div className="challenge-focus"><div className="challenge-countdown card"><div className="challenge-focus-icon"><ChallengeIcon width={30} height={30} /></div><span className="challenge-eyebrow">Get Ready!</span><h2>{seconds || 1}</h2><p>{challenge.subjectName} · {challenge.topicName} · {challenge.questionCount} questions</p></div></div>;
}

function LiveQuiz({ challenge, now, onAnswer, submitting }) {
  const q = challenge.currentQuestionData;
  const remaining = secondsUntil(challenge.questionDeadlineAt, now);
  const [selected, setSelected] = useState(q?.hasSubmitted ? q.answer : null);
  useEffect(() => { setSelected(q?.hasSubmitted ? q.answer : null); }, [q?.id, q?.hasSubmitted, q?.answer]);
  if (!q) return <div className="challenge-focus"><InitialLoader label="Loading question…" /></div>;
  const waiting = challenge.status === "waiting_for_opponent" || q.hasSubmitted;
  return <div className="challenge-page challenge-detail-page"><div className="challenge-live-top"><div><span className="challenge-eyebrow">{challenge.subjectName} · {challenge.topicName}</span><strong>Question {q.questionNumber} of {challenge.questionCount}</strong></div><div className={`challenge-timer${remaining <= 5 ? " danger" : ""}`}>◷ 00:{String(remaining).padStart(2, "0")}</div></div><div className="challenge-question card"><div className="challenge-question-meta"><span>{q.difficulty}</span><span>Shared learning objective</span></div><h2>{q.question}</h2><div className="challenge-options">{Object.entries(q.options || {}).map(([label, text]) => <button key={label} type="button" disabled={waiting || submitting} className={`challenge-option${selected === label ? " selected" : ""}`} onClick={() => setSelected(label)}><span className="challenge-option-label">{label}</span><span>{text}</span></button>)}</div><div className="challenge-answer-footer">{waiting ? <div className="challenge-submitted">✓ Answer submitted <span>Waiting for your opponent…</span></div> : <button type="button" className="btn btn-primary" disabled={!selected || submitting} onClick={() => onAnswer(q.id, selected)}>{submitting ? "Submitting…" : "Submit Answer"}</button>}</div></div></div>;
}

function RevealView({ challenge, onNext }) {
  const q = challenge.currentQuestionData;
  if (!q) return <div className="challenge-focus"><InitialLoader label="Revealing result…" /></div>;
  const own = (q.revealAnswers || []).find(a => a.userId === challenge.roleUserId);
  const opponent = (q.revealAnswers || []).find(a => a.userId === challenge.opponent?.id);
  const answerLabel = value => value ? `${value}${q.options?.[value] ? ` — ${q.options[value]}` : ""}` : "No answer";
  return <div className="challenge-page challenge-detail-page"><div className="challenge-live-top"><div><span className="challenge-eyebrow">Question {q.questionNumber} of {challenge.questionCount}</span><strong>Question Reveal</strong></div><span className={q.isCorrect ? "challenge-result-pill correct" : "challenge-result-pill wrong"}>{q.isCorrect ? "Correct" : "Review this one"}</span></div><div className="challenge-question card challenge-reveal-card"><h2>{q.question}</h2><div className="challenge-reveal-options">{Object.entries(q.options || {}).map(([label, text]) => <div key={label} className={`challenge-reveal-option ${label === q.correctAnswer ? "correct" : ""} ${label === own?.answer && !own?.isCorrect ? "wrong" : ""}`}><span>{label}</span><p>{text}</p></div>)}</div><div className="challenge-answer-comparison"><div><small>Your answer</small><strong>{answerLabel(own?.answer)}</strong>{own?.timedOut && <em>Timed out</em>}</div><div><small>Opponent's answer</small><strong>{answerLabel(opponent?.answer)}</strong>{opponent?.timedOut && <em>Timed out</em>}</div></div><div className="challenge-explanation"><small>Explanation</small><p>{q.explanation}</p></div><button type="button" className="btn btn-primary" onClick={onNext}>Next Question</button></div></div>;
}

function ResultsView({ challenge, results, review, loading, onReview, onBack }) {
  if (loading || !results) return <div className="challenge-focus"><InitialLoader label="Loading results…" /></div>;
  const perQuestion = results.perQuestion || [];
  const correct = perQuestion.filter(item => item.isCorrect).length;
  return <div className="challenge-page challenge-results-page"><ChallengeHeader onBack={onBack} title="Challenge Complete" subtitle={`${challenge.conceptName} · ${fmtDate(results.completedAt)}`} /><div className="challenge-results-hero card"><div className="challenge-trophy">🏆</div><h2>Your challenge results</h2><div className="challenge-score-grid"><div><small>Your Score</small><strong>{results.score}/{results.totalQuestions}</strong><span>{results.accuracy}% accuracy</span></div><div><small>Opponent Score</small><strong>{results.opponent.score}/{results.opponent.totalQuestions}</strong><span>{results.opponent.accuracy}% accuracy</span></div></div></div><div className="challenge-results-grid"><section className="card"><SectionTitle title="Performance" /><div className="challenge-stat-list"><div><span>Answered</span><strong>{results.questionsAnswered}/{results.totalQuestions}</strong></div><div><span>Correct</span><strong>{correct}</strong></div><div><span>Accuracy</span><strong>{results.accuracy}%</strong></div></div>{results.summary && <p className="challenge-summary">{results.summary}</p>}</section><section className="card"><SectionTitle title="Areas to review" />{results.weakAreas?.length ? <ul className="challenge-review-list">{results.weakAreas.map((item, i) => <li key={i}><span>•</span><div><strong>{item.area || item.title || item.objective || "Review area"}</strong><p>{item.reason || item.description || "Practice this area again in Learn."}</p></div></li>)}</ul> : <p className="challenge-muted">No weak-area signal was returned for this challenge.</p>}</section></div><div className="challenge-results-actions"><button type="button" className="btn btn-primary" onClick={onReview}>View Question Review</button><button type="button" className="btn btn-ghost" onClick={onBack}>Back to Challenge</button></div>{review && <ReviewPanel review={review} challenge={challenge} />}</div>;
}

function ReviewPanel({ review, challenge }) {
  return <section className="challenge-review-panel"><SectionTitle title="Question Review" /><div className="challenge-review-cards">{review.questions.map(q => { const own = (q.answers || []).find(a => a.userId === challenge.roleUserId); return <article key={q.id} className="challenge-review-card"><div className="challenge-review-number">{q.questionNumber}</div><div className="challenge-review-body"><strong>{q.question}</strong><div className="challenge-review-answer"><span>Your answer: {own?.answer || "Timed out"}</span><span>Correct: {q.correctAnswer}</span><span className={own?.isCorrect ? "correct" : "wrong"}>{own?.isCorrect ? "Correct" : "Review"}</span></div><p>{q.explanation}</p></div></article>; })}</div></section>;
}

function IncomingView({ challenge, busy, onAccept, onDecline, onBack }) {
  return <div className="challenge-page challenge-detail-page"><ChallengeHeader onBack={onBack} title="Incoming Challenge" subtitle="A peer wants to test your shared learning." /><div className="challenge-incoming card"><div className="challenge-incoming-avatar"><Avatar url={challenge.opponent?.photoURL} name={challenge.opponent?.displayName} size={76} online={challenge.opponent?.isOnline} /></div><span className="challenge-eyebrow">You've been challenged!</span><h2>{challenge.opponent?.displayName} wants to battle you in {challenge.conceptName}.</h2><div className="challenge-detail-facts"><div><small>Subject</small><strong>{challenge.subjectName}</strong></div><div><small>Topic</small><strong>{challenge.topicName}</strong></div><div><small>Concept</small><strong>{challenge.conceptName}</strong></div><div><small>Questions</small><strong>{challenge.questionCount}</strong></div></div><div className="challenge-incoming-actions"><button type="button" className="btn btn-primary" onClick={onAccept} disabled={busy}>{busy ? "Accepting…" : "Accept"}</button><button type="button" className="btn btn-ghost" onClick={onDecline} disabled={busy}>Decline</button></div></div></div>;
}

export default function ChallengePage() {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const now = useServerClock();
  const [challenges, setChallenges] = useState([]);
  const [peers, setPeers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [connectedPeerIds, setConnectedPeerIds] = useState(new Set());
  const [loadingHome, setLoadingHome] = useState(true);
  const [error, setError] = useState(null);
  const [showStart, setShowStart] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [results, setResults] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const wsRef = useRef(null);

  const loadHome = useCallback(async () => {
    setLoadingHome(true); setError(null);
    try {
      const [challengeData, peerData, sessionData, conversations] = await Promise.all([api.listChallenges(30), api.discoverUsers("All Levels", "all", "recommended"), api.getAISessions({ limit: 100, offset: 0 }), api.listConversations()]);
      const connected = new Set((Array.isArray(conversations) ? conversations : []).map(c => String(c?.partner?.uid ?? c?.partner?.id ?? c?.partnerId ?? "")).filter(Boolean));
      setConnectedPeerIds(connected);
      // Normalise: new API wraps each entry as { user, relationship, ... }; old shape was a flat user object.
      const rawPeers = Array.isArray(peerData) ? peerData.map(p => p?.user ?? p) : [];
      setChallenges(challengeData?.items || []); setPeers(rawPeers.filter(p => connected.has(String(p.uid ?? p.id)))); setSessions(Array.isArray(sessionData) ? sessionData : []);
    } catch (err) { setError(err.message || "Could not load Challenge."); }
    finally { setLoadingHome(false); }
  }, []);


  const loadChallenge = useCallback(async () => {
    if (!challengeId) return;
    try {
      const state = await api.getChallenge(challengeId);
      setChallenge({ ...state, roleUserId: Number(user?.uid) }); setError(null);
      if (["completed", "expired"].includes(state.status)) setResults(await api.getChallengeResults(challengeId).catch(() => null));
    } catch (err) { setError(err.message || "Could not load this challenge."); }
  }, [challengeId, user?.id]);

  useEffect(() => { if (!challengeId) loadHome(); }, [challengeId, loadHome]);
  useEffect(() => { if (challengeId) loadChallenge(); }, [challengeId, loadChallenge]);

  useEffect(() => {
    if (!challengeId) return undefined;
    let closed = false;
    const ws = api.openChallengeSocket(challengeId, {
      onOpen: socket => { if (!closed) socket.send(JSON.stringify({ type: "reconnect" })); },
      onMessage: event => {
        if (closed) return;
        if (event?.type === "error") { toast.error(event.data?.message || "Challenge connection error."); return; }
        if (event?.type === "challenge_state" && event.data) { setChallenge(prev => ({ ...prev, ...event.data, roleUserId: Number(user?.uid) })); return; }
        if (["question_started", "question_reveal", "next_question", "challenge_completed", "challenge_expired", "challenge_updated", "challenge_prepared", "challenge_declined", "player_ready", "opponent_reconnected", "opponent_disconnected", "countdown"].includes(event?.type)) window.setTimeout(loadChallenge, event.type === "question_reveal" ? 0 : 120);
      },
    });
    wsRef.current = ws;
    return () => { closed = true; try { ws.close(); } catch {} wsRef.current = null; };
  }, [challengeId, loadChallenge, toast, user?.id]);

  useEffect(() => {
    if (!challengeId) return undefined;
    const interval = window.setInterval(loadChallenge, 2500);
    return () => window.clearInterval(interval);
  }, [challengeId, loadChallenge]);

  async function perform(action, successMessage) {
    setBusy(true);
    try { const response = await action(); if (response?.challenge) setChallenge({ ...response.challenge, roleUserId: Number(user?.uid) }); await loadChallenge(); if (successMessage) toast.success(successMessage); }
    catch (err) { toast.error(err.message || "Challenge action failed."); }
    finally { setBusy(false); }
  }

  async function handleAnswer(questionId, answer) {
    setSubmitting(true);
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "answer", questionId, answer }));
      else await api.answerChallenge(challengeId, questionId, answer);
      await loadChallenge();
    } catch (err) { toast.error(err.message || "Couldn't submit your answer."); }
    finally { setSubmitting(false); }
  }

  async function handleReview() {
    if (review) return;
    try { setReview(await api.getChallengeReview(challengeId)); } catch (err) { toast.error(err.message || "Review isn't ready yet."); }
  }

  function openChallenge(id) { navigate(`/app/challenge/${id}`); }

  if (challengeId) {
    if (!challenge && !error) return <div className="challenge-page"><ChallengeHeader onBack={() => navigate("/app/challenge")} /><InitialLoader /></div>;
    if (error && !challenge) return <div className="challenge-page"><ChallengeHeader onBack={() => navigate("/app/challenge")} /><ErrorState message={error} onRetry={loadChallenge} /></div>;
    const state = challenge?.status;
    if (["completed", "expired"].includes(state)) return <ResultsView challenge={challenge} results={results} review={review} loading={!results} onReview={handleReview} onBack={() => navigate("/app/challenge")} />;
    if (state === "pending" && challenge.role === "opponent") return <IncomingView challenge={challenge} busy={busy} onAccept={() => perform(() => api.acceptChallenge(challenge.id), "Challenge accepted.")} onDecline={() => perform(() => api.declineChallenge(challenge.id), "Challenge declined.")} onBack={() => navigate("/app/challenge")} />;
    if (state === "pending") return <div className="challenge-page"><ChallengeHeader onBack={() => navigate("/app/challenge")} /><div className="challenge-empty card"><div className="challenge-empty-icon"><ChallengeIcon /></div><h2>Waiting for the opponent</h2><p>{challenge.waitingReason}</p></div></div>;
    if (["accepted", "preparing", "waiting"].includes(state)) return <WaitingRoom challenge={challenge} busy={busy} onPrepare={() => perform(() => api.prepareChallenge(challenge.id), "Battle prepared.")} onReady={() => perform(() => api.startChallenge(challenge.id), "You're ready.")} onRefresh={loadChallenge} onBack={() => navigate("/app/challenge")} />;
    if (state === "countdown") return <CountdownView challenge={challenge} now={now} />;
    if (["question_active", "waiting_for_opponent"].includes(state)) return <LiveQuiz challenge={challenge} now={now} onAnswer={handleAnswer} submitting={submitting} />;
    if (state === "question_reveal") return <RevealView challenge={challenge} onNext={loadChallenge} />;
    return <div className="challenge-page"><ChallengeHeader onBack={() => navigate("/app/challenge")} /><ErrorState message={`Challenge is currently ${fmtStatus(state)}.`} onRetry={loadChallenge} /></div>;
  }

  if (loadingHome) return <div className="challenge-page"><ChallengeHeader /><InitialLoader /></div>;
  if (error) return <div className="challenge-page"><ChallengeHeader /><ErrorState message={error} onRetry={loadHome} /></div>;
  return <><HomeView challenges={challenges} onStart={() => setShowStart(true)} onOpen={openChallenge} onRefresh={loadHome} />{showStart && <StartChallengeDialog peers={peers.filter(p => p.allowDirectMessage !== false && connectedPeerIds.has(String(p.uid ?? p.id)))} sessions={sessions} onClose={() => setShowStart(false)} onCreated={created => { setShowStart(false); navigate(`/app/challenge/${created.id}`); }} />}</>;
}
