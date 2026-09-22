import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

const SUBJECT_META = {
  Mathematics: { tone: "purple", symbol: "π", description: "Algebra, Geometry, Calculus, Statistics and more." },
  Physics: { tone: "blue", symbol: "⚛", description: "Mechanics, Electricity, Waves, Thermodynamics and more." },
  Chemistry: { tone: "green", symbol: "⚗", description: "Organic, Inorganic, Physical, Biochemistry and more." },
  Biology: { tone: "green", symbol: "⌁", description: "Cells, Genetics, Ecology, Human Biology and more." },
  "Computer Science": { tone: "purple", symbol: "</>", description: "Programming, Data Structures, Algorithms, Web Dev and more." },
  "English Language": { tone: "pink", symbol: "▥", description: "Grammar, Writing, Literature, Comprehension and more." },
  English: { tone: "pink", symbol: "▥", description: "Grammar, Writing, Literature, Comprehension and more." },
  Accounting: { tone: "gold", symbol: "▤", description: "Financial records, statements, costing and more." },
  Economics: { tone: "purple", symbol: "↗", description: "Micro, Macro, Trade, Development and more." },
  Geography: { tone: "cyan", symbol: "◎", description: "Physical, Human, Environmental, World Regions and more." },
  History: { tone: "gold", symbol: "▥", description: "World history, culture, governance and more." },
  Literature: { tone: "pink", symbol: "▥", description: "Poetry, Drama, Novel, Analysis and more." },
  "Art & Design": { tone: "cyan", symbol: "◉", description: "Visual arts, design principles, creativity and more." },
};

const FALLBACK_META = [
  { tone: "purple", symbol: "✦" },
  { tone: "blue", symbol: "◌" },
  { tone: "green", symbol: "◇" },
  { tone: "gold", symbol: "▤" },
  { tone: "pink", symbol: "◈" },
  { tone: "cyan", symbol: "◎" },
];

function iconMeta(name, index = 0) {
  const meta = SUBJECT_META[name];
  if (meta) return meta;
  return { ...FALLBACK_META[index % FALLBACK_META.length], description: "Explore this subject with your AI tutor." };
}

function normalizeSubjects(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.subjects) ? value.subjects : [];
}

function statusLabel(status) {
  const labels = {
    created: "Ready to start",
    teaching: "Learning",
    study: "Studying",
    retrieval: "Practice",
    practice: "Practice",
    reteaching: "Review",
    paused: "Paused",
  };
  return labels[status] || "In progress";
}

function Icon({ children, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function Arrow() {
  return (
    <Icon size={18}>
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  );
}

function SearchIcon() {
  return (
    <Icon size={21}>
      <circle cx="11" cy="11" r="6.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Icon>
  );
}

function RobotArt() {
  return (
    <div className="learn-hero-robot" aria-hidden="true">
      <span className="hero-spark hs1">✦</span>
      <span className="hero-spark hs2">✦</span>
      <span className="hero-spark hs3">+</span>
      <div className="hero-robot-antenna"><i /></div>
      <div className="hero-robot-head">
        <div className="hero-robot-face"><i /><i /><b /></div>
      </div>
      <div className="hero-robot-body"><span /></div>
      <div className="hero-robot-wing hero-left" />
      <div className="hero-robot-wing hero-right" />
      <div className="hero-robot-bubble">
        Let's make<br />learning simple<br />and fun!
      </div>
    </div>
  );
}

function SubjectIcon({ meta }) {
  return (
    <span className={`learn-subject-icon learn-tone-${meta.tone}`}>
      <span>{meta.symbol}</span>
    </span>
  );
}

function ProgressRing({ percent }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.min(100, Math.max(0, percent)) / 100;
  return (
    <div className="learn-progress-ring" style={{ "--ring-dash": `${dash}px`, "--ring-total": `${circumference}px` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r={radius} />
        <circle className="ring-fill" cx="50" cy="50" r={radius} />
      </svg>
      <strong>{percent}%</strong>
    </div>
  );
}

function QuickIcon({ type }) {
  if (type === "play") {
    return <Icon size={24}><path d="m9 7 9 5-9 5V7Z" fill="currentColor" /></Icon>;
  }
  if (type === "path") {
    return <Icon size={24}><circle cx="6" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" /><circle cx="18" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 16h4a6 6 0 0 0 6-6V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;
  }
  if (type === "target") {
    return <Icon size={24}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="m15 9 4-4M15 5h4v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;
  }
  return <Icon size={24}><path d="M6 3.5h9l3 3v14H6z" stroke="currentColor" strokeWidth="1.8" /><path d="M14 3.5V7h4M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></Icon>;
}

function ProgressSubject({ subject, completed, total, meta }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="learn-progress-subject">
      <SubjectIcon meta={meta} />
      <div className="learn-progress-subject-main">
        <div className="learn-progress-subject-row">
          <span>{subject.name}</span>
          <span>{completed}/{total}</span>
        </div>
        <div className="learn-mini-bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <Arrow />
    </div>
  );
}

export default function LearnHome() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [topicCounts, setTopicCounts] = useState({});
  const [sessions, setSessions] = useState([]);
  const [progress, setProgress] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;

    Promise.all([
      api.getSubjects("ALL").catch(() => []),
      api.getAISessions({ limit: 100, offset: 0 }).catch(() => []),
      api.getProgress().catch(() => null),
    ]).then(async ([subjectResult, sessionResult, progressResult]) => {
      if (!alive) return;

      const list = normalizeSubjects(subjectResult);
      setSubjects(list);

      const sessionList = Array.isArray(sessionResult) ? sessionResult : (sessionResult?.items || []);
      setSessions(sessionList);
      setProgress(progressResult);

      const pairs = await Promise.all(
        list.map(async subject => {
          try {
            const topics = await api.getTopics(subject.id);
            return [subject.id, Array.isArray(topics) ? topics.length : 0];
          } catch {
            return [subject.id, 0];
          }
        })
      );
      if (alive) {
        setTopicCounts(Object.fromEntries(pairs));
        setLoading(false);
      }
    }).catch(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, []);

  const activeSessions = useMemo(
    () => sessions.filter(s => !["completed", "abandoned"].includes(s.status)),
    [sessions]
  );

  const completedSessions = useMemo(
    () => sessions.filter(s => s.status === "completed"),
    [sessions]
  );

  const uniqueSubjects = useMemo(() => {
    const grouped = new Map();

    subjects.forEach((subject) => {
      const key = String(subject.name || "").trim().toLowerCase();
      if (!key) return;

      const existing = grouped.get(key);
      if (existing) {
        existing.variants.push(subject);
        return;
      }

      grouped.set(key, {
        ...subject,
        variants: [subject],
      });
    });

    return Array.from(grouped.values()).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [subjects]);

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueSubjects;
    return uniqueSubjects.filter(s =>
      `${s.name} ${s.description || ""}`.toLowerCase().includes(q)
    );
  }, [uniqueSubjects, query]);

  const overallPercent = sessions.length
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : 0;

  const subjectProgress = useMemo(() => {
    return subjects.slice(0, 4).map(subject => {
      const total = topicCounts[subject.id] || 0;
      const completed = completedSessions.filter(s => Number(s.subjectId) === Number(subject.id)).length;
      return { subject, total: Math.max(total, completed), completed };
    });
  }, [subjects, topicCounts, completedSessions]);

  const focusSession = activeSessions[0] || completedSessions[0] || null;
  const focusSubject = subjects.find(s => Number(s.id) === Number(focusSession?.subjectId));
  const focusTopic = focusSession?.topicName || (focusSession ? "Continue your current topic" : null);

  const displayPercent = Number.isFinite(overallPercent) ? overallPercent : 0;

  if (loading) {
    return (
      <div className="learn-home">
        <div className="learn-hero learn-skeleton">
          <div className="learn-skeleton-line wide" />
          <div className="learn-skeleton-line medium" />
          <div className="learn-skeleton-search" />
        </div>
        <div className="learn-content-grid">
          <div>
            <div className="learn-skeleton-line title" />
            <div className="learn-subject-grid">
              {[1,2,3,4,5,6].map(i => <div className="learn-skeleton-card" key={i} />)}
            </div>
          </div>
          <div className="learn-skeleton-side" />
        </div>
      </div>
    );
  }

  return (
    <div className="learn-home">
      <div className="learn-hero">
        <div className="learn-hero-copy">
          <div className="learn-hero-icon">
            <Icon size={42}>
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M6.5 19H18M8 7h6M8 10h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </Icon>
          </div>
          <div>
            <h1>What would you like to learn today?</h1>
            <p>Choose a subject and explore topics. Your AI tutor will guide you from basics to mastery.</p>
          </div>
        </div>
        <RobotArt />
        <form className="learn-hero-search" onSubmit={e => e.preventDefault()}>
          <SearchIcon />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for a subject, topic or keyword..."
            aria-label="Search for a subject, topic or keyword"
          />
        </form>
      </div>

      <div className="learn-home-highlights">
        <section className="learn-panel learn-robot-card">
          <div className="learn-robot-card-art"><RobotArt /></div>
          <div>
            <h3>Small steps.<br />Big progress.</h3>
            <p>Keep learning, one concept at a time.</p>
          </div>
          <div className="learn-growth-arrow">↗</div>
        </section>

        <button
          type="button"
          className="learn-focus-card"
          onClick={() => focusSession ? navigate(`/app/learn/ai/session/${focusSession.id}`) : navigate("/app/learn")}
        >
          <span className="learn-focus-icon"><QuickIcon type="target" /></span>
          <span>
            <strong>Today's Focus</strong>
            <small>{focusSubject ? `${focusSubject.name}${focusTopic ? ` · ${focusTopic}` : ""}` : "Pick a subject to begin"}</small>
          </span>
          <Arrow />
        </button>
      </div>

      <div className="learn-home-grid">
        <section className="learn-subject-area">
          <div className="learn-section-head">
            <h2>All Subjects</h2>
            <label className="learn-sort">
              <span>Sort by:</span>
              <select defaultValue="popular" aria-label="Sort subjects">
                <option value="popular">Popular</option>
                <option value="name">Name</option>
                <option value="topics">Topics</option>
              </select>
            </label>
          </div>

          {filteredSubjects.length === 0 ? (
            <div className="learn-empty">
              <span className="learn-empty-icon">📚</span>
              <h3>No subjects found</h3>
              <p>Try another search term.</p>
            </div>
          ) : (
            <div className="learn-subject-grid">
              {filteredSubjects.map((subject, index) => {
                const meta = iconMeta(subject.name, index);
                return (
                  <button
                    key={subject.name}
                    type="button"
                    className="learn-subject-card"
                    onClick={() => navigate(`/app/learn/ai/subject/${subject.id}`)}
                  >
                    <div className="learn-subject-card-top">
                      <SubjectIcon meta={meta} />
                      <Arrow />
                    </div>
                    <div className="learn-subject-card-copy">
                      <h3>{subject.name}</h3>
                      <p>{subject.description || meta.description}</p>
                    </div>
                    <div className="learn-subject-card-foot">
                      <span>
                        <Icon size={18}>
                          <path d="M4 7.5h16M4 12h16M4 16.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </Icon>
                        Choose your class
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
