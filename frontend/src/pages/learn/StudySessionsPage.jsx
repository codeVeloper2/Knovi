import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Atom,
  BarChart3,
  Beaker,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  Leaf,
  Lightbulb,
  Play,
  Search,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import * as api from "../../api";

const STATUS = {
  created: { label: "Ready", step: "Start", progress: 10 },
  teaching: { label: "In Progress", step: "Teach", progress: 35 },
  study: { label: "In Progress", step: "Study Time", progress: 60 },
  retrieval: { label: "In Progress", step: "Quiz", progress: 78 },
  practice: { label: "In Progress", step: "Practice", progress: 88 },
  reteaching: { label: "In Progress", step: "Review", progress: 72 },
  paused: { label: "In Progress", step: "Paused", progress: 60 },
  completed: { label: "Completed", step: "Completed", progress: 100 },
  abandoned: { label: "Abandoned", step: "Ended", progress: 0 },
};

const SUBJECT_META = {
  mathematics: { icon: "π", tone: "blue", Icon: BookOpen },
  physics: { icon: "⚛", tone: "purple", Icon: Atom },
  chemistry: { icon: "⚗", tone: "green", Icon: Beaker },
  biology: { icon: "◒", tone: "teal", Icon: Leaf },
  english: { icon: "Aa", tone: "pink", Icon: BookOpen },
  geography: { icon: "◎", tone: "cyan", Icon: TrendingUp },
  economics: { icon: "↗", tone: "purple", Icon: BarChart3 },
  accounting: { icon: "▤", tone: "amber", Icon: Activity },
  "computer science": { icon: "</>", tone: "violet", Icon: Zap },
};

function subjectMeta(name = "") {
  return SUBJECT_META[name.toLowerCase()] || { icon: "✦", tone: "blue", Icon: Brain };
}

function formatDate(value) {
  if (!value) return "Recently";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Recently";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(session) {
  const seconds =
    session?.studyDurationSeconds ??
    session?.durationSeconds ??
    session?.studyPeriod?.durationSeconds ??
    0;
  if (!seconds) return "AI learning session";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function ProgressRing({ value, tone = "blue", size = 74 }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dash = (safe / 100) * circumference;

  return (
    <div
      className={`study-progress-ring study-progress-ring--${tone}`}
      style={{ width: size, height: size }}
      aria-label={`${safe}% complete`}
    >
      <svg viewBox="0 0 74 74">
        <circle className="study-ring-track" cx="37" cy="37" r={radius} />
        <circle
          className="study-ring-value"
          cx="37"
          cy="37"
          r={radius}
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <strong>{safe}%</strong>
    </div>
  );
}

function SessionCard({ session, onContinue }) {
  const meta = STATUS[session.status] || STATUS.created;
  const subject = session.subjectName || "Learning";
  const topic = session.topicName || "AI Learning";
  const concept = session.conceptName || "Concept";
  const { icon, tone, Icon } = subjectMeta(subject);
  const completed = session.status === "completed";
  const score = session.overallScore;
  const progress = completed ? 100 : meta.progress;

  return (
    <article className="study-session-card">
      <div className={`study-subject-icon study-subject-icon--${tone}`}>
        {icon.length <= 3 ? <span>{icon}</span> : <Icon size={25} />}
      </div>

      <div className="study-session-info">
        <span className="study-session-subject">{subject}</span>
        <h2>{concept}</h2>
        <p>{topic} {topic !== concept ? `• ${concept}` : ""}</p>

        <div className="study-session-meta">
          <span><Clock3 size={14} /> {formatDate(session.updatedAt || session.createdAt)}</span>
          <span><Activity size={14} /> {formatDuration(session)}</span>
          <span className={`study-status-pill ${completed ? "completed" : ""}`}>
            {completed ? <CheckCircle2 size={13} /> : <span className="study-status-dot" />}
            {meta.label}
          </span>
        </div>
      </div>

      <div className="study-session-progress">
        <ProgressRing value={progress} tone={tone} />
      </div>

      <div className="study-session-action">
        {completed ? (
          <>
            <span className="study-detail-label">Score</span>
            <strong>{score != null ? `${score}/100` : "Completed"}</strong>
            <small>{score != null ? `${score}% accuracy` : "Session completed"}</small>
            <button type="button" className="study-outline-btn" onClick={() => onContinue(session)}>
              View Details <ChevronRight size={15} />
            </button>
          </>
        ) : (
          <>
            <span className="study-detail-label">Current Step</span>
            <strong>{meta.step}</strong>
            <small>
              {meta.step === "Study Time"
                ? "Read the concept carefully."
                : meta.step === "Quiz"
                  ? "Answer the questions to show what you've learned."
                  : meta.step === "Practice"
                    ? "Strengthen your understanding."
                    : "Continue your AI learning session."}
            </small>
            <button type="button" className="study-primary-btn" onClick={() => onContinue(session)}>
              Continue <ChevronRight size={15} />
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
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.getAISessions({ limit: 50, offset: 0 })
      .then(data => {
        if (!mounted) return;
        setSessions(Array.isArray(data) ? data : (data?.items || []));
      })
      .catch(() => {
        if (mounted) setSessions([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const stats = useMemo(() => {
    const completed = sessions.filter(s => s.status === "completed");
    const active = sessions.filter(s => !["completed", "abandoned"].includes(s.status));
    const scores = completed.map(s => Number(s.overallScore)).filter(Number.isFinite);
    return {
      total: sessions.filter(s => s.status !== "abandoned").length,
      completed: completed.length,
      active: active.length,
      accuracy: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0,
    };
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return sessions.filter(s => {
      if (tab === "in-progress" && ["completed", "abandoned"].includes(s.status)) return false;
      if (tab === "completed" && s.status !== "completed") return false;
      if (!q) return s.status !== "abandoned";
      const haystack = [
        s.subjectName,
        s.topicName,
        s.conceptName,
        s.intent,
        s.studentFamiliarity,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q) && s.status !== "abandoned";
    });
  }, [sessions, tab, search]);

  const recent = useMemo(() => sessions.filter(s => s.status !== "abandoned").slice(0, 4), [sessions]);

  const continueSession = session => {
    if (session.status === "completed") {
      navigate(`/app/learn/ai/session/${session.id}`);
      return;
    }
    navigate(`/app/learn/ai/session/${session.id}`);
  };

  return (
    <div className="learn-secondary-page study-sessions-page">
      <div className="study-page-layout">
        <main className="study-main">
          <header className="study-page-header">
            <div className="study-page-title">
              <div className="study-title-icon"><Clock3 size={30} /></div>
              <div>
                <h1>Study Sessions</h1>
                <p>Track your learning sessions, review past sessions, and continue where you left off.</p>
              </div>
            </div>
          </header>

          <div className="study-toolbar">
            <div className="study-tabs" role="tablist">
              <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All Sessions</button>
              <button className={tab === "in-progress" ? "active" : ""} onClick={() => setTab("in-progress")}>In Progress</button>
              <button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")}>Completed</button>
            </div>

            <div className="study-toolbar-actions">
              <label className="study-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search sessions, subjects or topics..."
                />
                {search && <button type="button" onClick={() => setSearch("")}><X size={15} /></button>}
              </label>
              <button
                type="button"
                className={`study-filter-btn ${filterOpen ? "active" : ""}`}
                onClick={() => setFilterOpen(v => !v)}
                aria-label="Filter sessions"
              >
                <Filter size={17} />
              </button>
            </div>
          </div>

          {filterOpen && (
            <div className="study-filter-popover">
              <span>Showing</span>
              <button onClick={() => { setTab("all"); setFilterOpen(false); }}>All sessions</button>
              <button onClick={() => { setTab("in-progress"); setFilterOpen(false); }}>In progress</button>
              <button onClick={() => { setTab("completed"); setFilterOpen(false); }}>Completed</button>
            </div>
          )}

          {loading ? (
            <div className="study-session-list">
              {[1, 2, 3, 4].map(i => <div className="study-session-skeleton" key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="learn-empty study-empty">
              <Brain size={34} />
              <h3>{sessions.length ? "No sessions match your filter" : "No study sessions yet"}</h3>
              <p>
                {sessions.length
                  ? "Try another search or session filter."
                  : "Choose a subject, topic, and concept to start your first AI session."}
              </p>
              <button type="button" className="study-primary-btn study-empty-btn" onClick={() => navigate("/app/learn")}>
                Explore Subjects
              </button>
            </div>
          ) : (
            <div className="study-session-list">
              {filtered.map(session => (
                <SessionCard key={session.id} session={session} onContinue={continueSession} />
              ))}
            </div>
          )}
        </main>

        <aside className="study-right-rail">
          <section className="study-side-card study-stats-card">
            <h2><BarChart3 size={20} /> Learning Stats</h2>
            <div className="study-stat-grid">
              <div><span><Activity size={16} /></span><strong>{stats.total}</strong><small>Total Sessions</small></div>
              <div><span><CheckCircle2 size={16} /></span><strong>{stats.completed}</strong><small>Completed</small></div>
              <div><span><Zap size={16} /></span><strong>{stats.active}</strong><small>In Progress</small></div>
              <div><span><Target size={16} /></span><strong>{stats.accuracy}%</strong><small>Avg. Accuracy</small></div>
            </div>
          </section>

          <section className="study-side-card">
            <h2><Clock3 size={19} /> Recent Activity</h2>
            <div className="study-recent-list">
              {recent.length ? recent.map(s => {
                const { icon, tone } = subjectMeta(s.subjectName);
                return (
                  <button key={s.id} type="button" onClick={() => continueSession(s)}>
                    <span className={`study-recent-icon study-subject-icon--${tone}`}>{icon}</span>
                    <span>
                      <strong>{s.conceptName || "Learning session"}</strong>
                      <small>{s.subjectName || "Learn"} • {formatDate(s.updatedAt || s.createdAt)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                );
              }) : <p className="study-side-empty">Your recent sessions will appear here.</p>}
            </div>
          </section>

          <section className="study-side-card study-tip-card">
            <h2><Lightbulb size={19} /> Quick Tips</h2>
            <div className="study-tip">
              <strong>Consistency beats intensity.</strong>
              <p>Short, focused sessions help you learn better and remember longer.</p>
              <Target size={32} />
            </div>
            <div className="study-tip-dots"><i /><i className="active" /><i /></div>
          </section>

          <section className="study-side-card study-keep-card">
            <div className="study-keep-icon"><Brain size={30} /></div>
            <div>
              <strong>Keep going!</strong>
              <p>Every session brings you one step closer to your goals.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
