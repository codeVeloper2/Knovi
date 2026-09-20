import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

const STATUS_META = {
  created:   { label: "Ready",      progress: 10, tone: "blue",   step: "Ready to learn", detail: "Your AI session is ready to begin." },
  teaching:  { label: "In Progress",progress: 35, tone: "blue",   step: "Teach",         detail: "AI is explaining the concept..." },
  study:     { label: "In Progress",progress: 60, tone: "blue",   step: "Study Time",    detail: "Read the concept carefully." },
  retrieval: { label: "In Progress",progress: 75, tone: "blue",   step: "Quiz",          detail: "Answer questions to show what you learned." },
  practice:  { label: "In Progress",progress: 85, tone: "blue",   step: "Practice",      detail: "Strengthen your understanding." },
  reteaching:{ label: "In Progress",progress: 80, tone: "purple", step: "Review",        detail: "AI is adapting the explanation for you." },
  paused:    { label: "Paused",     progress: 50, tone: "gold",   step: "Paused",        detail: "Continue when you're ready." },
  completed: { label: "Completed", progress: 100,tone: "green",   step: "Completed",     detail: "Learning session completed." },
  abandoned: { label: "Abandoned", progress: 0,  tone: "muted",   step: "Abandoned",     detail: "This session was ended early." },
};

const SUBJECT_TONES = {
  Mathematics: "purple",
  Physics: "purple",
  Chemistry: "green",
  Biology: "green",
  "Computer Science": "cyan",
  Accounting: "gold",
  Economics: "gold",
  English: "pink",
  Geography: "cyan",
  History: "gold",
  Literature: "pink",
};

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    play: <><path d="m9 6 9 6-9 6V6Z"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></>,
    activity: <><path d="M4 12h3l2-6 4 12 2-6h5"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z"/><path d="M8 20h11"/></>,
  };
  return <svg {...common}>{paths[name] || paths.book}</svg>;
}

function SubjectMark({ subject }) {
  const tone = SUBJECT_TONES[subject] || "blue";
  const symbol =
    subject === "Physics" ? "⚛" :
    subject === "Chemistry" ? "⚗" :
    subject === "Biology" ? "◈" :
    subject === "Mathematics" ? "π" :
    subject === "Computer Science" ? "</>" :
    subject === "English" || subject === "Literature" ? "▤" :
    subject === "Accounting" ? "▤" : "✦";
  return <span className={`study-subject-mark tone-${tone}`}>{symbol}</span>;
}

function ProgressRing({ value, tone = "blue" }) {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className={`study-ring tone-${tone}`} aria-label={`${value}% progress`}>
      <svg viewBox="0 0 64 64">
        <circle className="study-ring-track" cx="32" cy="32" r={radius} />
        <circle
          className="study-ring-fill"
          cx="32" cy="32" r={radius}
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <strong>{value}%</strong>
    </div>
  );
}

function formatWhen(value) {
  if (!value) return "Not started";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not started";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function SessionCard({ session, onContinue }) {
  const meta = STATUS_META[session.status] || STATUS_META.created;
  const subject = session.subjectName || "Subject";
  const topic = session.topicName || "Learning session";
  const concept = session.conceptName || "";
  const tone = SUBJECT_TONES[subject] || meta.tone;

  const completed = session.status === "completed";
  const score = Number.isFinite(session.overallScore) ? session.overallScore : null;

  return (
    <article className={`study-session-card ${completed ? "is-completed" : ""}`}>
      <SubjectMark subject={subject} />

      <div className="study-session-info">
        <span className="study-session-subject">{subject}</span>
        <h2>{concept || topic}</h2>
        <p>{topic}{concept && concept !== topic ? ` · ${concept}` : ""}</p>
        <div className="study-session-meta">
          <span><Icon name="clock" size={14}/>{formatWhen(session.startedAt || session.createdAt)}</span>
          <span><Icon name="clock" size={14}>{/* decorative */}</Icon>{completed ? "Completed" : "AI session"}</span>
          <span className={`study-status status-${meta.tone}`}>{meta.label}</span>
        </div>
      </div>

      <ProgressRing value={completed ? 100 : meta.progress} tone={tone} />

      <div className="study-session-action">
        {completed ? (
          <>
            <span className="study-score-label">Score</span>
            <strong>{score !== null ? `${score}%` : "—"}</strong>
            <small>{score !== null ? "Overall score" : "No score recorded"}</small>
            <button type="button" className="study-outline-btn" onClick={() => onContinue(session)}>
              View details <Icon name="arrow" size={15}/>
            </button>
          </>
        ) : (
          <>
            <span className="study-step-label">Current Step</span>
            <strong>{meta.step}</strong>
            <small>{meta.detail}</small>
            <button type="button" className="study-primary-btn" onClick={() => onContinue(session)}>
              Continue <Icon name="arrow" size={15}/>
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function StudySessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getAISessions({ limit: 100, offset: 0 })
      .then(data => {
        if (!alive) return;
        setSessions(Array.isArray(data) ? data : (data?.items || []));
      })
      .catch(() => {
        if (alive) setSessions([]);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter(session => {
      const statusOk =
        tab === "all" ||
        (tab === "progress" && !["completed", "abandoned"].includes(session.status)) ||
        (tab === "completed" && session.status === "completed");
      if (!statusOk) return false;
      if (!q) return true;
      return [session.subjectName, session.topicName, session.conceptName, session.intent]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [sessions, tab, search]);

  const stats = useMemo(() => {
    const completed = sessions.filter(s => s.status === "completed");
    const inProgress = sessions.filter(s => !["completed", "abandoned"].includes(s.status));
    const scored = completed.filter(s => Number.isFinite(s.overallScore));
    const avg = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.overallScore, 0) / scored.length) : 0;
    return { total: sessions.length, completed: completed.length, inProgress: inProgress.length, avg };
  }, [sessions]);

  const recent = sessions.slice(0, 4);

  const openSession = session => {
    if (session?.id) navigate(`/app/learn/ai/session/${session.id}`);
  };

  return (
    <div className="study-page">
      <div className="study-main">
        <header className="study-header">
          <div className="study-title-icon"><Icon name="clock" size={28}/></div>
          <div>
            <h1>Study Sessions</h1>
            <p>Track your learning sessions, review past sessions, and continue where you left off.</p>
          </div>
        </header>

        <div className="study-toolbar">
          <div className="study-tabs" role="tablist">
            {[
              ["all", "All Sessions"],
              ["progress", "In Progress"],
              ["completed", "Completed"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="study-search-wrap">
            <Icon name="search" size={18}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sessions, subjects or topics..."
              aria-label="Search sessions"
            />
            <button type="button" className="study-filter-btn" aria-label="Filter sessions">
              <Icon name="filter" size={18}/>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="study-session-list">
            {[1,2,3].map(i => <div className="study-session-card study-skeleton" key={i}/>)}
          </div>
        ) : filtered.length ? (
          <div className="study-session-list">
            {filtered.map(session => <SessionCard key={session.id} session={session} onContinue={openSession}/>)}
          </div>
        ) : (
          <div className="study-empty">
            <div className="study-empty-icon"><Icon name="activity" size={36}/></div>
            <h2>{sessions.length ? "No sessions match your search" : "No study sessions yet"}</h2>
            <p>{sessions.length ? "Try another search or switch the session filter." : "Choose a subject, topic, and concept to start your first AI session."}</p>
            <button type="button" className="study-primary-btn" onClick={() => navigate("/app/learn")}>
              Explore Subjects
            </button>
          </div>
        )}
      </div>

      <aside className="study-rail">
        <section className="study-rail-card">
          <div className="study-rail-title"><Icon name="chart" size={20}/><h2>Learning Stats</h2></div>
          <div className="study-stat-grid">
            <div><span className="study-stat-icon"><Icon name="activity" size={17}/></span><strong>{stats.total}</strong><small>Total Sessions</small></div>
            <div><span className="study-stat-icon success"><Icon name="check" size={17}/></span><strong>{stats.completed}</strong><small>Completed</small></div>
            <div><span className="study-stat-icon pink"><Icon name="activity" size={17}/></span><strong>{stats.inProgress}</strong><small>In Progress</small></div>
            <div><span className="study-stat-icon gold"><Icon name="target" size={17}/></span><strong>{stats.avg}%</strong><small>Avg. Accuracy</small></div>
          </div>
        </section>

        <section className="study-rail-card">
          <div className="study-rail-title"><Icon name="clock" size={18}/><h2>Recent Activity</h2></div>
          {recent.length ? (
            <div className="study-recent-list">
              {recent.map(session => (
                <button key={session.id} type="button" onClick={() => openSession(session)}>
                  <SubjectMark subject={session.subjectName || ""}/>
                  <span><strong>{session.conceptName || session.topicName || "Learning session"}</strong><small>{session.subjectName || "Learn"} · {formatWhen(session.createdAt)}</small></span>
                  <Icon name="arrow" size={15}/>
                </button>
              ))}
            </div>
          ) : (
            <p className="study-rail-empty">Your recent sessions will appear here.</p>
          )}
        </section>

        <section className="study-rail-card study-tip-card">
          <div className="study-rail-title"><Icon name="target" size={18}/><h2>Quick Tips</h2></div>
          <div className="study-tip">
            <strong>Consistency beats intensity.</strong>
            <p>Short, focused sessions help you learn better and remember longer.</p>
            <span>● ● ●</span>
          </div>
        </section>

        <section className="study-rail-card study-keep-card">
          <Icon name="activity" size={34}/>
          <div><strong>Keep going!</strong><p>Every session brings you one step closer to your goals.</p></div>
        </section>
      </aside>
    </div>
  );
}
