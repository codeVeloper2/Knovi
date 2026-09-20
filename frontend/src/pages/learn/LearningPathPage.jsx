import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

const META = {
  Mathematics: { tone: "purple", symbol: "π" },
  Physics: { tone: "purple", symbol: "⚛" },
  Chemistry: { tone: "green", symbol: "⚗" },
  Biology: { tone: "green", symbol: "⌁" },
  "Computer Science": { tone: "purple", symbol: "</>" },
  "English Language": { tone: "pink", symbol: "▥" },
  English: { tone: "pink", symbol: "▥" },
  Accounting: { tone: "gold", symbol: "▤" },
  Economics: { tone: "purple", symbol: "↗" },
  Geography: { tone: "cyan", symbol: "◎" },
  History: { tone: "gold", symbol: "▥" },
  Literature: { tone: "pink", symbol: "▥" },
  "Art & Design": { tone: "cyan", symbol: "◉" },
};

const FALLBACK = [
  ["purple", "✦"], ["blue", "◌"], ["green", "◇"], ["gold", "▤"], ["pink", "◈"], ["cyan", "◎"],
];

function metaFor(name, index = 0) {
  if (META[name]) return META[name];
  const [tone, symbol] = FALLBACK[index % FALLBACK.length];
  return { tone, symbol };
}

function Icon({ children, size = 22, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function Arrow({ size = 18 }) {
  return <Icon size={size}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

function SubjectIcon({ subject, index = 0, small = false }) {
  const meta = metaFor(subject?.name, index);
  return <span className={`lp-subject-icon lp-tone-${meta.tone}${small ? " small" : ""}`}><span>{meta.symbol}</span></span>;
}

function ProgressRing({ percent, size = 76 }) {
  const radius = 34;
  const total = 2 * Math.PI * radius;
  const dash = total * Math.max(0, Math.min(100, percent)) / 100;
  return (
    <div className="lp-ring" style={{ width: size, height: size, "--lp-dash": `${dash}px`, "--lp-total": `${total}px` }}>
      <svg viewBox="0 0 80 80">
        <circle className="lp-ring-track" cx="40" cy="40" r={radius} />
        <circle className="lp-ring-fill" cx="40" cy="40" r={radius} />
      </svg>
      <strong>{percent}%</strong>
    </div>
  );
}

function CheckIcon() {
  return <Icon size={17}><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

function LockIcon() {
  return <Icon size={17}><rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;
}

function StatusIcon({ status }) {
  if (status === "completed") return <span className="lp-status done"><CheckIcon /></span>;
  if (status === "in_progress") return <span className="lp-status active"><span /></span>;
  if (status === "locked") return <span className="lp-status locked"><LockIcon /></span>;
  return <span className="lp-status available"><span /></span>;
}

function normalizeSubjects(value) {
  return Array.isArray(value) ? value : (Array.isArray(value?.subjects) ? value.subjects : []);
}

function normalizeTopics(value) {
  return Array.isArray(value) ? value : (Array.isArray(value?.topics) ? value.topics : []);
}

function isCompleted(session) {
  return session?.status === "completed";
}

function isActive(session) {
  return session && !["completed", "abandoned"].includes(session.status);
}

export default function LearningPathPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [topicsBySubject, setTopicsBySubject] = useState({});
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.getSubjects().catch(() => []),
      api.getAISessions({ limit: 100, offset: 0 }).catch(() => []),
    ]).then(async ([subjectResult, sessionResult]) => {
      if (!alive) return;
      const list = normalizeSubjects(subjectResult);
      const sessionList = Array.isArray(sessionResult) ? sessionResult : (sessionResult?.items || []);
      setSubjects(list);
      setSessions(sessionList);

      const pairs = await Promise.all(list.map(async subject => {
        try {
          const result = await api.getTopics(subject.id);
          return [subject.id, normalizeTopics(result)];
        } catch {
          return [subject.id, []];
        }
      }));

      if (!alive) return;
      const map = Object.fromEntries(pairs);
      setTopicsBySubject(map);

      const preferred = list.find(s => String(s.name).toLowerCase() === "physics")
        || list.find(s => map[s.id]?.length)
        || list[0];
      if (preferred) {
        setSelectedId(preferred.id);
        setExpanded(new Set(map[preferred.id]?.length ? [map[preferred.id][0].id] : []));
      }
    }).catch(() => {
      if (alive) setError("We couldn't load your learning path.");
    }).finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, []);

  const selectedSubject = useMemo(
    () => subjects.find(s => Number(s.id) === Number(selectedId)) || null,
    [subjects, selectedId]
  );

  const rawTopics = selectedSubject ? (topicsBySubject[selectedSubject.id] || []) : [];

  const topicStates = useMemo(() => {
    let foundActive = false;
    return rawTopics.map((topic, index) => {
      const topicSessions = sessions.filter(s => Number(s.topicId) === Number(topic.id));
      const completed = topicSessions.filter(isCompleted);
      const active = topicSessions.find(isActive);

      let status = "locked";
      if (completed.length) status = "completed";
      else if (active || (!foundActive && index === 0)) {
        status = active ? "in_progress" : "available";
        if (active) foundActive = true;
      }

      return {
        ...topic,
        index: index + 1,
        status,
        sessions: topicSessions,
        completedSessions: completed.length,
        activeSession: active || null,
        conceptCount: Number(topic.conceptCount || 0),
      };
    });
  }, [rawTopics, sessions]);

  const completedCount = topicStates.filter(t => t.status === "completed").length;
  const activeCount = topicStates.filter(t => t.status === "in_progress").length;
  const lockedCount = topicStates.filter(t => t.status === "locked").length;
  const availableCount = topicStates.filter(t => t.status === "available").length;
  const total = topicStates.length;
  const percent = total ? Math.round((completedCount / total) * 100) : 0;

  const visibleTopics = useMemo(() => {
    if (filter === "completed") return topicStates.filter(t => t.status === "completed");
    if (filter === "progress") return topicStates.filter(t => t.status === "in_progress");
    if (filter === "locked") return topicStates.filter(t => t.status === "locked");
    return topicStates;
  }, [topicStates, filter]);

  const nextTopic = topicStates.find(t => t.status === "in_progress")
    || topicStates.find(t => t.status === "available")
    || topicStates.find(t => t.status === "locked");

  const focusSession = nextTopic?.activeSession || null;

  const overall = useMemo(() => {
    const allTopics = Object.values(topicsBySubject).flat();
    if (!allTopics.length) return { completed: 0, total: 0, percent: 0 };
    const completed = allTopics.filter(topic =>
      sessions.some(s => Number(s.topicId) === Number(topic.id) && s.status === "completed")
    ).length;
    return { completed, total: allTopics.length, percent: Math.round((completed / allTopics.length) * 100) };
  }, [topicsBySubject, sessions]);

  const openTopic = topic => {
    if (!selectedSubject || topic.status === "locked") return;
    if (topic.activeSession?.id) {
      navigate(`/app/learn/ai/session/${topic.activeSession.id}`);
      return;
    }
    navigate(`/app/learn/ai/subject/${selectedSubject.id}/topic/${topic.id}`);
  };

  const selectSubject = id => {
    setSelectedId(id);
    setFilter("all");
    const first = topicsBySubject[id]?.[0];
    setExpanded(new Set(first ? [first.id] : []));
  };

  if (loading) {
    return (
      <div className="lp-page">
        <div className="lp-skeleton-head" />
        <div className="lp-skeleton-bar" />
        <div className="lp-skeleton-content">
          <div className="lp-skeleton-main">{[1,2,3,4].map(i => <div key={i} className="lp-skeleton-row" />)}</div>
          <div className="lp-skeleton-side" />
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="lp-page"><div className="lp-empty"><h2>Learning Path</h2><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div></div>;
  }

  return (
    <div className="lp-page">
      <header className="lp-header">
        <div className="lp-title-wrap">
          <div className="lp-title-icon">
            <Icon size={39}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" strokeWidth="1.8" /><path d="M7 19h11M8 8h6M8 11h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></Icon>
          </div>
          <div>
            <h1>Learning Path</h1>
            <p>Follow your personalized roadmap, complete topics, and build your skills step by step.</p>
          </div>
        </div>
        <div className="lp-motivation">
          <span className="lp-target-icon">◎</span>
          <div><strong>Small steps.<br />Big progress.</strong><span>Keep going and build your future.</span></div>
          <span className="lp-flag">⚑</span>
        </div>
      </header>

      <div className="lp-layout">
        <main className="lp-main">
          <section className="lp-subject-bar">
            <div className="lp-subject-heading">
              <SubjectIcon subject={selectedSubject || { name: "" }} />
              <div>
                <label htmlFor="lp-subject-select">Learning subject</label>
                <div className="lp-select-wrap">
                  <select id="lp-subject-select" value={selectedId ?? ""} onChange={e => selectSubject(e.target.value)}>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <span>⌄</span>
                </div>
                <p>{selectedSubject?.description || "Explore the curriculum and progress one topic at a time."}</p>
              </div>
            </div>
            <div className="lp-overall">
              <ProgressRing percent={percent} size={70} />
              <div><strong>Overall Progress</strong><span>{completedCount} of {total} topics completed</span></div>
              <div className="lp-overall-bar"><span style={{ width: `${percent}%` }} /></div>
            </div>
          </section>

          <div className="lp-filters" role="tablist" aria-label="Learning path filters">
            {[
              ["all", "All Topics", total, "☑"],
              ["completed", "Completed", completedCount, "✓"],
              ["progress", "In Progress", activeCount, "◴"],
              ["locked", "Locked", lockedCount, "⌑"],
            ].map(([value, label, count, icon]) => (
              <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                <span>{icon}</span>{label}<b>{count}</b>
              </button>
            ))}
          </div>

          <div className="lp-topic-list">
            {visibleTopics.length === 0 ? (
              <div className="lp-empty">
                <div className="lp-empty-icon">◎</div>
                <h3>No topics in this view</h3>
                <p>Choose another filter or explore a different subject.</p>
              </div>
            ) : (
              visibleTopics.map(topic => {
                const open = expanded.has(topic.id);
                return (
                  <section className={`lp-topic-group ${topic.status}`} key={topic.id}>
                    <button
                      type="button"
                      className="lp-topic-group-head"
                      onClick={() => setExpanded(prev => {
                        const next = new Set(prev);
                        if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id);
                        return next;
                      })}
                      aria-expanded={open}
                    >
                      <span className="lp-topic-number">{topic.index}</span>
                      <span className="lp-topic-group-copy">
                        <strong>{topic.name}</strong>
                        <small>{topic.description || "Build your understanding one concept at a time."}</small>
                      </span>
                      <span className="lp-topic-count">
                        {topic.completedSessions ? `${topic.completedSessions} ${topic.completedSessions === 1 ? "session" : "sessions"}` : `${topic.conceptCount} concepts`}
                      </span>
                      <span className={`lp-chevron ${open ? "open" : ""}`}>⌄</span>
                    </button>

                    {open && (
                      <div className="lp-topic-detail">
                        <div className="lp-topic-status-row">
                          <StatusIcon status={topic.status} />
                          <div><strong>{topic.status === "completed" ? "Completed" : topic.status === "in_progress" ? "In Progress" : topic.status === "available" ? "Ready to start" : "Locked"}</strong>
                            <span>{topic.status === "locked" ? "Complete the previous topic first." : topic.status === "in_progress" ? "Continue your current learning session." : "Start an AI learning session to master this topic."}</span>
                          </div>
                        </div>
                        <div className="lp-topic-actions">
                          <button type="button" className={`lp-topic-action ${topic.status === "locked" ? "disabled" : ""}`} disabled={topic.status === "locked"} onClick={() => openTopic(topic)}>
                            {topic.status === "completed" ? "Review" : topic.status === "in_progress" ? "Continue" : "Start Learning"} <Arrow size={16} />
                          </button>
                          {topic.conceptCount > 0 && <span>{topic.conceptCount} concepts</span>}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </main>

        <aside className="lp-rail">
          <section className="lp-card lp-journey">
            <div className="lp-card-title">Your Learning Journey</div>
            <div className="lp-journey-top">
              <ProgressRing percent={overall.percent} size={72} />
              <div><strong>{overall.completed} of {overall.total} topics completed</strong><span>Across your curriculum</span></div>
            </div>
            {[
              ["completed", "Completed", completedCount, total ? Math.round(completedCount / total * 100) : 0],
              ["progress", "In Progress", activeCount, total ? Math.round(activeCount / total * 100) : 0],
              ["locked", "Locked", lockedCount, total ? Math.round(lockedCount / total * 100) : 0],
            ].map(([key, label, count, pct]) => (
              <div className="lp-journey-row" key={key}>
                <span className={`lp-dot ${key}`} />
                <span>{label}</span><b>{count}</b>
                <div className="lp-journey-bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
          </section>

          <section className="lp-card lp-next">
            <h2><span>ϟ</span> Next up</h2>
            {nextTopic ? (
              <>
                <div className="lp-next-main">
                  <SubjectIcon subject={selectedSubject} small />
                  <div><strong>{nextTopic.name}</strong><span>{selectedSubject?.name} · {nextTopic.status === "in_progress" ? "In progress" : "Next topic"}</span></div>
                </div>
                <button type="button" onClick={() => openTopic(nextTopic)} disabled={nextTopic.status === "locked"}>Continue Learning <Arrow size={15} /></button>
              </>
            ) : <p>No topics available yet.</p>}
          </section>

          <section className="lp-card lp-goal">
            <div className="lp-goal-head"><h2>◎ Learning Goals</h2><button type="button" onClick={() => setFilter("all")}>Set your goal</button></div>
            <strong>Current goal</strong>
            <p>Master the basics of {selectedSubject?.name || "your subject"}</p>
            <div className="lp-goal-bar"><span style={{ width: `${percent}%` }} /></div>
            <small>{completedCount} of {total} topics</small>
            <button type="button" className="lp-edit-goal" onClick={() => setFilter("all")}>Edit Goal</button>
          </section>

          <section className="lp-card lp-quick">
            <h2>Quick Actions</h2>
            <button type="button" onClick={() => navigate("/app/learn")}><span>▣</span><div><strong>Browse All Subjects</strong><small>Explore other subjects</small></div><Arrow size={16} /></button>
            <button type="button" onClick={() => navigate("/app/learn/saved")}><span>▤</span><div><strong>View Saved Resources</strong><small>Your saved study materials</small></div><Arrow size={16} /></button>
          </section>
        </aside>
      </div>
    </div>
  );
}
