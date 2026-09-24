import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { ChallengeIcon, CloseIcon, ChevronRight } from "../../components/DashIcons";
import katex from "katex";
import "katex/dist/katex.min.css";
import "../../styles/challenge.css";

const ACTIVE_STATUSES = new Set([
  "pending", "accepted", "preparing", "waiting", "countdown",
  "question_active", "waiting_for_opponent", "question_reveal", "next_question",
]);

/* ─── Primitives ─────────────────────────────────────────────────────── */


function MathText({ text }) {
  if (!text) return null;
  const source = String(text);
  const parts = source.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("$$") && part.endsWith("$$")) {
          try {
            return <span key={i} className="ch-math ch-math-display" dangerouslySetInnerHTML={{ __html: katex.renderToString(part.slice(2, -2).trim(), { displayMode: true, throwOnError: false, strict: "ignore" }) }} />;
          } catch { return <span key={i}>{part}</span>; }
        }
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          try {
            return <span key={i} className="ch-math" dangerouslySetInnerHTML={{ __html: katex.renderToString(part.slice(1, -1).trim(), { throwOnError: false, strict: "ignore" }) }} />;
          } catch { return <span key={i}>{part}</span>; }
        }
        // Light bare-macro pass
        const soft = part.replace(/(\\frac\s*\{[^{}]*\}\s*\{[^{}]*\}|\\leq?|\\geq?|\\neq?|\\times|\\cdot|\\sqrt\s*(?:\[[^\]]*\])?\s*\{[^{}]*\})/g, (m) => {
          try { return katex.renderToString(m, { throwOnError: false, strict: "ignore" }); } catch { return m; }
        });
        if (soft !== part && soft.includes("katex")) {
          return <span key={i} className="ch-math" dangerouslySetInnerHTML={{ __html: soft }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Avatar({ url, name, size = 44, online = false }) {
  const initial = (name || "P").trim().charAt(0).toUpperCase();
  return (
    <span className="ch-avatar" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span className="ch-avatar-initial">{initial}</span>}
      {online ? <span className="ch-avatar-dot" /> : null}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function fmtStatus(status) {
  return String(status || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function Skeleton({ className = "" }) {
  return <span className={`ch-skel ${className}`} aria-hidden="true" />;
}

function PageShell({ children, className = "" }) {
  return <div className={`ch-page ${className}`.trim()}>{children}</div>;
}

function Header({ onBack, title = "Challenge", subtitle = "Test your knowledge. Learn together." }) {
  return (
    <header className="ch-header">
      {onBack ? (
        <button type="button" className="ch-back" onClick={onBack} aria-label="Back">
          <ChevronRight style={{ transform: "rotate(180deg)" }} />
        </button>
      ) : (
        <span className="ch-header-icon"><ChallengeIcon width={20} height={20} /></span>
      )}
      <div className="ch-header-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="ch-empty ch-empty--error">
      <div className="ch-empty-icon">!</div>
      <h2>Connection issue</h2>
      <p>{message || "We couldn't load this challenge right now."}</p>
      {onRetry ? <button type="button" className="ch-btn ch-btn-primary" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

/* ─── Skeletons ──────────────────────────────────────────────────────── */

function HomeSkeleton() {
  return (
    <PageShell>
      <Header />
      <div className="ch-home">
        <div className="ch-card ch-skel-card">
          <Skeleton className="ch-skel-line w40" />
          <Skeleton className="ch-skel-line w80" />
          <Skeleton className="ch-skel-btn" />
        </div>
        <div className="ch-section-label"><Skeleton className="ch-skel-line w30" /></div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="ch-card ch-skel-row">
            <Skeleton className="ch-skel-avatar" />
            <div className="ch-skel-stack">
              <Skeleton className="ch-skel-line w50" />
              <Skeleton className="ch-skel-line w70" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

function QuizSkeleton({ label = "Loading question…" }) {
  return (
    <PageShell className="ch-quiz-page">
      <div className="ch-quiz-top">
        <Skeleton className="ch-skel-line w40" />
        <Skeleton className="ch-skel-timer" />
      </div>
      <div className="ch-quiz-card">
        <Skeleton className="ch-skel-pill" />
        <Skeleton className="ch-skel-line w90" />
        <Skeleton className="ch-skel-line w75" />
        <div className="ch-skel-options">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="ch-skel-option" />)}
        </div>
        <Skeleton className="ch-skel-btn wide" />
        <p className="ch-skel-hint">{label}</p>
      </div>
    </PageShell>
  );
}

/* ─── Home ───────────────────────────────────────────────────────────── */

function HomeView({ challenges, onStart, onOpen, onRefresh }) {
  const incoming = challenges.filter((c) => c.status === "pending" && c.role === "opponent");
  const active = challenges.filter((c) => ACTIVE_STATUSES.has(c.status) && !(c.status === "pending" && c.role === "opponent"));
  const history = challenges.filter((c) => ["completed", "expired", "declined", "cancelled"].includes(c.status));

  return (
    <PageShell>
      <Header />
      <div className="ch-home">
        <div className="ch-hero card">
          <div className="ch-hero-icon"><ChallengeIcon width={28} height={28} /></div>
          <div>
            <h2>Quiz Battle</h2>
            <p>Challenge a peer who finished the same concept, or battle UPRAD.</p>
          </div>
          <button type="button" className="ch-btn ch-btn-primary" onClick={onStart}>Start challenge</button>
        </div>

        {incoming.length > 0 && (
          <section className="ch-section">
            <h3 className="ch-section-title">Incoming</h3>
            <div className="ch-list">
              {incoming.map((ch) => (
                <button key={ch.id} type="button" className="ch-list-card" onClick={() => onOpen(ch.id)}>
                  <Avatar url={ch.opponent?.photoURL} name={ch.opponent?.displayName} size={44} online={ch.opponent?.isOnline} />
                  <span className="ch-list-copy">
                    <strong>{ch.opponent?.displayName || "Peer"}</strong>
                    <small>{ch.conceptName} · {ch.questionCount} questions</small>
                  </span>
                  <span className="ch-pill ch-pill-warn">Accept</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="ch-section">
          <div className="ch-section-head">
            <h3 className="ch-section-title">Active</h3>
            <button type="button" className="ch-text-btn" onClick={onRefresh}>Refresh</button>
          </div>
          {active.length ? (
            <div className="ch-list">
              {active.map((ch) => (
                <button key={ch.id} type="button" className="ch-list-card" onClick={() => onOpen(ch.id)}>
                  <Avatar url={ch.opponent?.photoURL} name={ch.mode === "ai" ? "UPRAD" : ch.opponent?.displayName} size={44} />
                  <span className="ch-list-copy">
                    <strong>{ch.mode === "ai" ? "UPRAD" : ch.opponent?.displayName || "Peer"}</strong>
                    <small>{ch.conceptName} · {fmtStatus(ch.status)}</small>
                  </span>
                  <span className="ch-pill ch-pill-live">{fmtStatus(ch.status)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ch-empty-inline">No active challenges. Start one above.</div>
          )}
        </section>

        <section className="ch-section">
          <h3 className="ch-section-title">History</h3>
          {history.length ? (
            <div className="ch-list">
              {history.map((ch) => (
                <button key={ch.id} type="button" className="ch-list-card" onClick={() => onOpen(ch.id)}>
                  <Avatar url={ch.opponent?.photoURL} name={ch.mode === "ai" ? "UPRAD" : ch.opponent?.displayName} size={44} />
                  <span className="ch-list-copy">
                    <strong>{ch.mode === "ai" ? "UPRAD" : ch.opponent?.displayName || "Peer"}</strong>
                    <small>{ch.conceptName} · {fmtDate(ch.completedAt || ch.createdAt)}</small>
                  </span>
                  <span className="ch-pill">{fmtStatus(ch.status)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ch-empty-inline">Completed battles will show up here.</div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function StartChallengeDialog({ peers, sessions, onClose, onCreated }) {
  const toast = useToast();
  const [peer, setPeer] = useState(null);
  const [session, setSession] = useState(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const eligibleSessions = sessions.filter((s) => !["abandoned", "created"].includes(s.status) && s.conceptId);
  const filteredPeers = peers.filter((p) => (p.displayName || "").toLowerCase().includes(query.trim().toLowerCase()));

  async function submit() {
    if (!peer || !session) return;
    setSaving(true);
    try {
      const result = await api.createChallenge({
        opponentId: peer.uid ?? peer.id,
        subjectId: session.subjectId,
        topicId: session.topicId,
        conceptId: session.conceptId,
        questionCount,
      });
      onCreated(result.challenge || result);
    } catch (err) {
      toast.error(err.message || "Could not create challenge.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ch-modal-backdrop" onClick={onClose}>
      <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal-head">
          <h2>Start a challenge</h2>
          <button type="button" className="ch-icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <label className="ch-field-label">Peer</label>
        <input className="ch-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search peers…" />
        <div className="ch-scroll-list">
          {filteredPeers.length ? filteredPeers.map((p) => (
            <button key={p.uid ?? p.id} type="button" className={`ch-pick-row ${peer && (peer.uid ?? peer.id) === (p.uid ?? p.id) ? "selected" : ""}`} onClick={() => setPeer(p)}>
              <Avatar url={p.photoURL} name={p.displayName} size={40} online={p.isOnline} />
              <span><strong>{p.displayName}</strong><small>{p.isOnline ? "Online" : "Offline"}</small></span>
              <span className="ch-check">{peer && (peer.uid ?? peer.id) === (p.uid ?? p.id) ? "✓" : ""}</span>
            </button>
          )) : <div className="ch-empty-inline">No connected peers available.</div>}
        </div>
        <label className="ch-field-label">Learned concept</label>
        <div className="ch-scroll-list">
          {eligibleSessions.length ? eligibleSessions.map((s) => (
            <button key={s.id} type="button" className={`ch-pick-row ${session?.id === s.id ? "selected" : ""}`} onClick={() => setSession(s)}>
              <span className="ch-check">{session?.id === s.id ? "✓" : ""}</span>
              <span><strong>{s.conceptName || "Concept"}</strong><small>{[s.subjectName, s.topicName].filter(Boolean).join(" · ")}</small></span>
            </button>
          )) : <div className="ch-empty-inline">Complete an AI learning session first.</div>}
        </div>
        <label className="ch-field-label">Questions</label>
        <div className="ch-count-row">
          {[3, 5, 7, 10].map((n) => (
            <button key={n} type="button" className={questionCount === n ? "selected" : ""} onClick={() => setQuestionCount(n)}>{n}</button>
          ))}
        </div>
        <button type="button" className="ch-btn ch-btn-primary ch-btn-block" disabled={!peer || !session || saving} onClick={submit}>
          {saving ? "Creating…" : "Send challenge"}
        </button>
      </div>
    </div>
  );
}

/* ─── Waiting / countdown / incoming ─────────────────────────────────── */

function WaitingRoom({ challenge, busy, onPrepare, onReady, onRefresh, onBack }) {
  const ready = challenge.ready;
  const preparing = challenge.status === "preparing";
  const aiMode = challenge.mode === "ai";

  return (
    <PageShell>
      <Header onBack={onBack} title="Challenge room" subtitle={aiMode ? "UPRAD is your partner" : "Both players must be ready"} />
      <div className="ch-room card">
        <div className="ch-versus">
          <div className="ch-player">
            <Avatar size={64} name="You" />
            <strong>You</strong>
            <span className={ready ? "is-ready" : "is-wait"}>{ready ? "Ready" : "Not ready"}</span>
          </div>
          <div className="ch-vs">VS</div>
          <div className="ch-player">
            {aiMode ? (
              <>
                <Avatar size={64} name="UPRAD" />
                <strong>UPRAD</strong>
                <span className="is-ready">AI ready</span>
              </>
            ) : (
              <>
                <Avatar size={64} name={challenge.opponent?.displayName} url={challenge.opponent?.photoURL} online={challenge.opponent?.isOnline} />
                <strong>{challenge.opponent?.displayName}</strong>
                <span className={challenge.opponentReady ? "is-ready" : "is-wait"}>{challenge.opponentReady ? "Ready" : "Getting ready"}</span>
              </>
            )}
          </div>
        </div>

        <div className="ch-room-meta">
          <span>{challenge.subjectName}</span>
          <span>{challenge.topicName}</span>
          <span>{challenge.conceptName}</span>
          <span>{challenge.questionCount} questions</span>
        </div>

        <ol className="ch-steps">
          <li className="done">Created</li>
          <li className={preparing ? "current" : challenge.status === "waiting" ? "done" : ""}>Prepare questions</li>
          <li className={challenge.status === "waiting" && !ready ? "current" : ready ? "done" : ""}>{aiMode ? "Confirm" : "Ready up"}</li>
          <li>Countdown</li>
        </ol>

        <p className="ch-room-note">
          {aiMode
            ? (preparing ? "UPRAD is generating theory + objective questions once — no extra AI work between questions." : challenge.waitingReason)
            : challenge.waitingReason}
        </p>

        <div className="ch-room-actions">
          {challenge.status === "accepted" && (
            <button type="button" className="ch-btn ch-btn-primary" onClick={onPrepare} disabled={busy}>
              {busy ? "Preparing…" : "Prepare battle"}
            </button>
          )}
          {preparing && (
            <div className="ch-preparing">
              <span className="ch-spinner" />
              <span>Building the quiz set…</span>
            </div>
          )}
          {challenge.status === "waiting" && (
            <button type="button" className="ch-btn ch-btn-primary" onClick={onReady} disabled={busy || ready}>
              {ready ? (aiMode ? "You're set" : "You're ready") : busy ? "Saving…" : "I'm ready"}
            </button>
          )}
          <button type="button" className="ch-btn ch-btn-ghost" onClick={onRefresh}>Refresh</button>
        </div>
      </div>
    </PageShell>
  );
}

function CountdownView({ challenge, now }) {
  const seconds = secondsUntil(
    challenge.countdownStartedAt
      ? new Date(new Date(challenge.countdownStartedAt).getTime() + 3000).toISOString()
      : null,
    now,
  );
  return (
    <PageShell className="ch-focus">
      <div className="ch-countdown card">
        <span className="ch-eyebrow">Get ready</span>
        <div className="ch-countdown-num">{seconds || 1}</div>
        <p>{challenge.conceptName} · {challenge.questionCount} questions</p>
      </div>
    </PageShell>
  );
}

function IncomingView({ challenge, busy, onAccept, onDecline, onBack }) {
  return (
    <PageShell>
      <Header onBack={onBack} title="Incoming challenge" subtitle="A peer wants to battle on a shared concept" />
      <div className="ch-incoming card">
        <Avatar url={challenge.opponent?.photoURL} name={challenge.opponent?.displayName} size={72} online={challenge.opponent?.isOnline} />
        <h2>{challenge.opponent?.displayName} challenged you</h2>
        <p className="ch-incoming-concept">{challenge.conceptName}</p>
        <div className="ch-fact-grid">
          <div><small>Subject</small><strong>{challenge.subjectName}</strong></div>
          <div><small>Topic</small><strong>{challenge.topicName}</strong></div>
          <div><small>Questions</small><strong>{challenge.questionCount}</strong></div>
        </div>
        <div className="ch-room-actions">
          <button type="button" className="ch-btn ch-btn-primary" onClick={onAccept} disabled={busy}>{busy ? "Accepting…" : "Accept"}</button>
          <button type="button" className="ch-btn ch-btn-ghost" onClick={onDecline} disabled={busy}>Decline</button>
        </div>
      </div>
    </PageShell>
  );
}

/* ─── Live quiz ──────────────────────────────────────────────────────── */

function LiveQuiz({ challenge, now, onAnswer, submitting }) {
  const q = challenge.currentQuestionData;
  const remaining = secondsUntil(challenge.questionDeadlineAt, now);
  const [selected, setSelected] = useState(q?.hasSubmitted ? q.answer : null);
  const isLast = q && Number(q.questionNumber) >= Number(challenge.questionCount);
  const waiting = challenge.status === "waiting_for_opponent" || q?.hasSubmitted;

  useEffect(() => {
    setSelected(q?.hasSubmitted ? q.answer : null);
  }, [q?.id, q?.hasSubmitted, q?.answer]);

  if (!q) return <QuizSkeleton label="Loading next question…" />;

  const progress = Math.round((Number(q.questionNumber) / Math.max(1, Number(challenge.questionCount))) * 100);

  return (
    <PageShell className="ch-quiz-page">
      <div className="ch-quiz-top">
        <div>
          <span className="ch-eyebrow">{challenge.subjectName} · {challenge.topicName}</span>
          <strong className="ch-quiz-progress-label">Question {q.questionNumber} of {challenge.questionCount}</strong>
        </div>
        <div className={`ch-timer ${remaining <= 5 ? "danger" : ""}`}>
          <span className="ch-timer-icon">◷</span>
          00:{String(remaining).padStart(2, "0")}
        </div>
      </div>

      <div className="ch-progress-track" aria-hidden="true">
        <div className="ch-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="ch-quiz-card">
        <div className="ch-quiz-meta">
          <span className="ch-diff">{q.difficulty || "medium"}</span>
          <span className="ch-meta-hint">Theory + objectives</span>
        </div>
        <h2 className="ch-quiz-question"><MathText text={q.question} /></h2>

        <div className="ch-options" role="listbox" aria-label="Answer options">
          {Object.entries(q.options || {}).map(([label, text]) => (
            <button
              key={label}
              type="button"
              role="option"
              aria-selected={selected === label}
              disabled={waiting || submitting}
              className={`ch-option ${selected === label ? "selected" : ""}`}
              onClick={() => setSelected(label)}
            >
              <span className="ch-option-letter">{label}</span>
              <span className="ch-option-text"><MathText text={text} /></span>
            </button>
          ))}
        </div>

        <div className="ch-quiz-footer">
          {waiting ? (
            <div className="ch-submitted">
              <span className="ch-submitted-check">✓</span>
              <div>
                <strong>Answer locked in</strong>
                <small>
                  {isLast
                    ? (challenge.mode === "ai" ? "Scoring your challenge…" : "Waiting for opponent — then final score")
                    : (challenge.mode === "ai" ? "Moving on when ready…" : "Waiting for your opponent…")}
                </small>
              </div>
              {isLast ? <span className="ch-spinner" /> : null}
            </div>
          ) : (
            <button
              type="button"
              className="ch-btn ch-btn-primary ch-btn-block"
              disabled={!selected || submitting}
              onClick={() => onAnswer(q.id, selected)}
            >
              {submitting ? "Submitting…" : isLast ? "Submit final answer" : "Submit answer"}
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function RevealView({ challenge, onNext }) {
  const q = challenge.currentQuestionData;
  if (!q) return <QuizSkeleton label="Revealing result…" />;

  const own = (q.revealAnswers || []).find((a) => a.userId === challenge.roleUserId);
  const opponent = (q.revealAnswers || []).find((a) => a.userId === challenge.opponent?.id);
  const isLast = Number(q.questionNumber) >= Number(challenge.questionCount);
  const answerLabel = (value) => (value ? `${value}${q.options?.[value] ? ` — ${q.options[value]}` : ""}` : "No answer");

  return (
    <PageShell className="ch-quiz-page">
      <div className="ch-quiz-top">
        <div>
          <span className="ch-eyebrow">Question {q.questionNumber} of {challenge.questionCount}</span>
          <strong className="ch-quiz-progress-label">Answer reveal</strong>
        </div>
        <span className={`ch-result-pill ${q.isCorrect ? "correct" : "wrong"}`}>
          {q.isCorrect ? "Correct" : "Review"}
        </span>
      </div>

      <div className="ch-quiz-card ch-reveal-card">
        <h2 className="ch-quiz-question"><MathText text={q.question} /></h2>

        <div className="ch-reveal-options">
          {Object.entries(q.options || {}).map(([label, text]) => {
            const isCorrect = label === q.correctAnswer;
            const isOwnWrong = label === own?.answer && !own?.isCorrect;
            return (
              <div key={label} className={`ch-reveal-option ${isCorrect ? "correct" : ""} ${isOwnWrong ? "wrong" : ""}`}>
                <span className="ch-option-letter">{label}</span>
                <p>{text}</p>
              </div>
            );
          })}
        </div>

        <div className="ch-compare">
          <div>
            <small>Your answer</small>
            <strong>{answerLabel(own?.answer)}</strong>
            {own?.timedOut ? <em>Timed out</em> : null}
          </div>
          <div>
            <small>{challenge.mode === "ai" ? "Marking" : "Opponent"}</small>
            <strong>
              {challenge.mode === "ai"
                ? (q.isCorrect ? "Correct" : "Needs review")
                : answerLabel(opponent?.answer)}
            </strong>
            {opponent?.timedOut ? <em>Timed out</em> : null}
          </div>
        </div>

        {q.explanation ? (
          <div className="ch-explain">
            <small>Explanation</small>
            <p>{q.explanation}</p>
          </div>
        ) : null}

        <button type="button" className="ch-btn ch-btn-primary ch-btn-block" onClick={onNext}>
          {isLast ? "See final results" : "Next question"}
        </button>
      </div>
    </PageShell>
  );
}

/* ─── Results ────────────────────────────────────────────────────────── */

function ResultsView({ challenge, results, review, loading, onReview, onBack, onRematch, rematchBusy }) {
  if (loading || !results) {
    return (
      <PageShell>
        <Header onBack={onBack} title="Challenge complete" subtitle="Loading results…" />
        <div className="ch-results-skel">
          <Skeleton className="ch-skel-hero" />
          <Skeleton className="ch-skel-line w60" />
          <Skeleton className="ch-skel-card-lg" />
        </div>
      </PageShell>
    );
  }

  const perQuestion = results.perQuestion || [];
  const correct = perQuestion.filter((item) => item.isCorrect).length;
  const myScore = Number(results.score ?? 0);
  const oppScore = challenge.mode === "ai" ? null : Number(results.opponent?.score ?? 0);
  const outcome = challenge.mode === "ai"
    ? (myScore >= Math.ceil((results.totalQuestions || 1) * 0.6) ? "win" : "review")
    : myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

  const copy = {
    win: { title: "You won!", sub: "Strong run. Rematch to keep the edge.", emoji: "🏆", cls: "is-win" },
    loss: { title: "Opponent won", sub: "Review misses, then challenge again.", emoji: "⚔️", cls: "is-loss" },
    draw: { title: "It's a draw", sub: "Same score. Rematch to break the tie.", emoji: "🤝", cls: "is-draw" },
    review: { title: "Challenge complete", sub: "Review theory, then try UPRAD again.", emoji: "📘", cls: "is-review" },
  }[outcome];

  return (
    <PageShell className="ch-results-page">
      <Header onBack={onBack} title="Challenge complete" subtitle={`${challenge.conceptName} · ${fmtDate(results.completedAt)}`} />

      <div className={`ch-results-hero card ${copy.cls}`}>
        <div className={`ch-outcome ${copy.cls}`}>
          <span className="ch-outcome-emoji">{copy.emoji}</span>
          <div>
            <strong>{copy.title}</strong>
            <p>{copy.sub}</p>
          </div>
        </div>
        <div className="ch-score-grid">
          <div>
            <small>Your score</small>
            <strong>{results.score}/{results.totalQuestions}</strong>
            <span>{results.accuracy}% accuracy</span>
          </div>
          {challenge.mode === "ai" ? (
            <div>
              <small>Partner</small>
              <strong>UPRAD</strong>
              <span>AI challenge</span>
            </div>
          ) : (
            <div>
              <small>Opponent</small>
              <strong>{results.opponent.score}/{results.opponent.totalQuestions}</strong>
              <span>{results.opponent.accuracy}% accuracy</span>
            </div>
          )}
        </div>
      </div>

      <div className="ch-results-grid">
        <section className="card">
          <h3 className="ch-card-title">Performance</h3>
          <div className="ch-stat-row">
            <div><span>Answered</span><strong>{results.questionsAnswered}/{results.totalQuestions}</strong></div>
            <div><span>Correct</span><strong>{correct}</strong></div>
            <div><span>Accuracy</span><strong>{results.accuracy}%</strong></div>
          </div>
          {results.summary ? <p className="ch-summary">{results.summary}</p> : null}
        </section>
        <section className="card">
          <h3 className="ch-card-title">Areas to review</h3>
          {results.weakAreas?.length ? (
            <ul className="ch-weak-list">
              {results.weakAreas.map((item, i) => (
                <li key={i}>
                  <strong>{item.area || item.title || item.objective || "Review area"}</strong>
                  <p>{item.reason || item.description || "Practice this again in Learn."}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ch-muted">No weak-area signal for this run.</p>
          )}
        </section>
      </div>

      <div className="ch-results-actions">
        <button type="button" className="ch-btn ch-btn-primary" onClick={onRematch} disabled={rematchBusy}>
          {rematchBusy ? "Starting…" : challenge.mode === "ai" ? "Challenge UPRAD again" : "Rematch"}
        </button>
        <button type="button" className="ch-btn ch-btn-ghost" onClick={onReview}>Question review</button>
        <button type="button" className="ch-btn ch-btn-ghost" onClick={onBack}>Back</button>
      </div>

      {review ? (
        <section className="ch-review-panel">
          <h3 className="ch-card-title">Question review</h3>
          <div className="ch-review-list">
            {review.questions.map((rq) => {
              const own = (rq.answers || []).find((a) => a.userId === challenge.roleUserId);
              return (
                <article key={rq.id} className="ch-review-card">
                  <div className="ch-review-num">{rq.questionNumber}</div>
                  <div>
                    <strong>{rq.question}</strong>
                    <div className="ch-review-meta">
                      <span>Yours: {own?.answer || "Timed out"}</span>
                      <span>Correct: {rq.correctAnswer}</span>
                      <span className={own?.isCorrect ? "ok" : "bad"}>{own?.isCorrect ? "Correct" : "Review"}</span>
                    </div>
                    {rq.explanation ? <p>{rq.explanation}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}

/* ─── Page root ──────────────────────────────────────────────────────── */

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
  const [rematchBusy, setRematchBusy] = useState(false);
  const wsRef = useRef(null);

  const loadHome = useCallback(async () => {
    setLoadingHome(true);
    setError(null);
    try {
      const [challengeData, peerData, sessionData, conversations] = await Promise.all([
        api.listChallenges(30),
        api.discoverUsers("All Levels", "all", "recommended"),
        api.getAISessions({ limit: 100, offset: 0 }),
        api.listConversations(),
      ]);
      const connected = new Set(
        (Array.isArray(conversations) ? conversations : [])
          .map((c) => String(c?.partner?.uid ?? c?.partner?.id ?? c?.partnerId ?? ""))
          .filter(Boolean),
      );
      setConnectedPeerIds(connected);
      const rawPeers = Array.isArray(peerData) ? peerData.map((p) => p?.user ?? p) : [];
      setChallenges(challengeData?.items || []);
      setPeers(rawPeers.filter((p) => connected.has(String(p.uid ?? p.id))));
      setSessions(Array.isArray(sessionData) ? sessionData : []);
    } catch (err) {
      setError(err.message || "Could not load Challenge.");
    } finally {
      setLoadingHome(false);
    }
  }, []);

  const loadChallenge = useCallback(async () => {
    if (!challengeId) return;
    try {
      const state = await api.getChallenge(challengeId);
      setChallenge({ ...state, roleUserId: Number(user?.uid) });
      setError(null);
      if (["completed", "expired"].includes(state.status)) {
        setResults(await api.getChallengeResults(challengeId).catch(() => null));
      }
    } catch (err) {
      setError(err.message || "Could not load this challenge.");
    }
  }, [challengeId, user?.uid]);

  useEffect(() => {
    if (!challengeId) loadHome();
  }, [challengeId, loadHome]);

  useEffect(() => {
    if (challengeId) loadChallenge();
  }, [challengeId, loadChallenge]);

  useEffect(() => {
    if (!challengeId) return undefined;
    let closed = false;
    const ws = api.openChallengeSocket(challengeId, {
      onOpen: (socket) => {
        if (!closed) socket.send(JSON.stringify({ type: "reconnect" }));
      },
      onMessage: (event) => {
        if (closed) return;
        if (event?.type === "error") {
          toast.error(event.data?.message || "Challenge connection error.");
          return;
        }
        if (event?.type === "challenge_state" && event.data) {
          setChallenge((prev) => ({ ...prev, ...event.data, roleUserId: Number(user?.uid) }));
          return;
        }
        if ([
          "question_started", "question_reveal", "next_question", "challenge_completed",
          "challenge_expired", "challenge_updated", "challenge_prepared", "challenge_declined",
          "player_ready", "opponent_reconnected", "opponent_disconnected", "countdown",
        ].includes(event?.type)) {
          window.setTimeout(loadChallenge, event.type === "question_reveal" ? 0 : 120);
        }
      },
    });
    wsRef.current = ws;
    return () => {
      closed = true;
      try { ws.close(); } catch { /* ignore */ }
      wsRef.current = null;
    };
  }, [challengeId, loadChallenge, toast, user?.uid]);

  useEffect(() => {
    if (!challengeId) return undefined;
    const interval = window.setInterval(loadChallenge, 2500);
    return () => window.clearInterval(interval);
  }, [challengeId, loadChallenge]);

  async function perform(action, successMessage) {
    setBusy(true);
    try {
      const response = await action();
      if (response?.challenge) setChallenge({ ...response.challenge, roleUserId: Number(user?.uid) });
      await loadChallenge();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      toast.error(err.message || "Challenge action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(questionId, answer) {
    setSubmitting(true);
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "answer", questionId, answer }));
      } else {
        await api.answerChallenge(challengeId, questionId, answer);
      }
      await loadChallenge();
    } catch (err) {
      toast.error(err.message || "Couldn't submit your answer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview() {
    if (review) return;
    try {
      setReview(await api.getChallengeReview(challengeId));
    } catch (err) {
      toast.error(err.message || "Review isn't ready yet.");
    }
  }

  async function handleRematch() {
    if (!challenge || rematchBusy) return;
    setRematchBusy(true);
    try {
      let sourceSessionId = challenge.sourceSessionAId || challenge.sourceSessionId || challenge.source_session_a_id;
      if (!sourceSessionId) {
        try {
          const list = await api.getAISessions({ limit: 50, offset: 0 });
          const match = (Array.isArray(list) ? list : []).find(
            (s) => Number(s.conceptId) === Number(challenge.conceptId)
              && !["abandoned", "created"].includes(s.status),
          );
          sourceSessionId = match?.id;
        } catch { /* ignore */ }
      }

      if (challenge.mode === "ai") {
        if (!sourceSessionId) throw new Error("No learning session found for this concept.");
        const result = await api.createAIChallenge({
          subjectId: challenge.subjectId,
          topicId: challenge.topicId,
          conceptId: challenge.conceptId,
          sourceSessionId: Number(sourceSessionId),
          questionCount: challenge.questionCount || 5,
        });
        const id = result?.challenge?.id || result?.id || result?.challengeId;
        if (!id) throw new Error("Could not start a new AI challenge.");
        toast.success("New AI challenge started.");
        navigate(`/app/challenge/${id}`);
        return;
      }

      if (sourceSessionId) {
        const status = await api.joinChallengeMatchmaking({
          subjectId: challenge.subjectId,
          topicId: challenge.topicId,
          conceptId: challenge.conceptId,
          sourceSessionId: Number(sourceSessionId),
          questionCount: challenge.questionCount || 5,
        });
        if (status?.status === "matched" && status?.challengeId) {
          toast.success("Peer found — rematch ready.");
          navigate(`/app/challenge/${status.challengeId}`);
          return;
        }
        toast.success("Looking for a peer for rematch…");
        navigate("/app/challenge");
        return;
      }

      toast.error("Could not start a rematch.");
      navigate("/app/challenge");
    } catch (err) {
      toast.error(err.message || "Could not start a rematch.");
    } finally {
      setRematchBusy(false);
    }
  }

  /* Detail route */
  if (challengeId) {
    if (!challenge && !error) {
      return (
        <PageShell>
          <Header onBack={() => navigate("/app/challenge")} />
          <QuizSkeleton label="Opening challenge…" />
        </PageShell>
      );
    }
    if (error && !challenge) {
      return (
        <PageShell>
          <Header onBack={() => navigate("/app/challenge")} />
          <ErrorState message={error} onRetry={loadChallenge} />
        </PageShell>
      );
    }

    const state = challenge?.status;

    if (["completed", "expired"].includes(state)) {
      return (
        <ResultsView
          challenge={challenge}
          results={results}
          review={review}
          loading={!results}
          onReview={handleReview}
          onBack={() => navigate("/app/challenge")}
          onRematch={handleRematch}
          rematchBusy={rematchBusy}
        />
      );
    }
    if (state === "pending" && challenge.role === "opponent") {
      return (
        <IncomingView
          challenge={challenge}
          busy={busy}
          onAccept={() => perform(() => api.acceptChallenge(challenge.id), "Challenge accepted.")}
          onDecline={() => perform(() => api.declineChallenge(challenge.id), "Challenge declined.")}
          onBack={() => navigate("/app/challenge")}
        />
      );
    }
    if (state === "pending") {
      return (
        <PageShell>
          <Header onBack={() => navigate("/app/challenge")} />
          <div className="ch-empty card">
            <div className="ch-empty-icon"><ChallengeIcon /></div>
            <h2>Waiting for opponent</h2>
            <p>{challenge.waitingReason || "They haven't accepted yet."}</p>
          </div>
        </PageShell>
      );
    }
    if (["accepted", "preparing", "waiting"].includes(state)) {
      return (
        <WaitingRoom
          challenge={challenge}
          busy={busy}
          onPrepare={() => perform(() => api.prepareChallenge(challenge.id), "Battle prepared.")}
          onReady={() => perform(() => api.startChallenge(challenge.id), "You're ready.")}
          onRefresh={loadChallenge}
          onBack={() => navigate("/app/challenge")}
        />
      );
    }
    if (state === "countdown") return <CountdownView challenge={challenge} now={now} />;
    if (["question_active", "waiting_for_opponent"].includes(state)) {
      return <LiveQuiz challenge={challenge} now={now} onAnswer={handleAnswer} submitting={submitting} />;
    }
    if (state === "question_reveal") {
      return <RevealView challenge={challenge} onNext={loadChallenge} />;
    }
    if (state === "next_question") {
      return <QuizSkeleton label="Loading next question…" />;
    }

    return (
      <PageShell>
        <Header onBack={() => navigate("/app/challenge")} />
        <ErrorState message={`Challenge is currently ${fmtStatus(state)}.`} onRetry={loadChallenge} />
      </PageShell>
    );
  }

  /* Home route */
  if (loadingHome) return <HomeSkeleton />;
  if (error) {
    return (
      <PageShell>
        <Header />
        <ErrorState message={error} onRetry={loadHome} />
      </PageShell>
    );
  }

  return (
    <>
      <HomeView
        challenges={challenges}
        onStart={() => setShowStart(true)}
        onOpen={(id) => navigate(`/app/challenge/${id}`)}
        onRefresh={loadHome}
      />
      {showStart && (
        <StartChallengeDialog
          peers={peers.filter((p) => p.allowDirectMessage !== false && connectedPeerIds.has(String(p.uid ?? p.id)))}
          sessions={sessions}
          onClose={() => setShowStart(false)}
          onCreated={(created) => {
            setShowStart(false);
            navigate(`/app/challenge/${created.id}`);
          }}
        />
      )}
    </>
  );
}
